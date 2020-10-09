let Adapter, Robot, TextMessage, User;
try {
    ({ Robot, Adapter, TextMessage, User } = require('hubot'));
} catch (error) {
    let prequire = require('parent-require');
    ({ Robot, Adapter, TextMessage, User } = prequire('hubot'));
}

const port = process.env.WHATSAPP_ADAPTER_PORT || 3000
const qs = require('qs')

class WhatsAppBusiness extends Adapter {

    constructor(robot) {
        super(robot)
        this.sid = process.env.TWILIO_ACCOUNT_SID
        this.token = process.env.TWILIO_ACCOUNT_TOKEN
        this.emptyResponse = "<Response></Response>";
    }
}

exports.use = (robot) => {

    let adapter = new WhatsAppBusiness(robot);

    adapter.run = function () {
        this.info(`Runing '${this.robot.name}' with WhatAppBusiness Hubot Adapter...`)
        if (!this.sid) {
            this.robot.emit("error", new Error("Twilion AccountSID has to be set to start the adapter."))
            process.exit(1)
        } else if (!this.token) {
            this.robot.emit("error", new Error("Twilion AccountToken has to be set to start the adapter."))
            process.exit(1)
        }

        // parse application/json AND application/x-www-form-urlencoded
        //this.robot.router.use(this.robot.router.json())
        //this.robot.router.use(this.robot.router.urlencoded({ extended: true }))

        // listening to WhatsAppBusiness API incoming messages
        this.robot.router.post('/messages', (req, res) => {
            if (req.body.AccountSid != this.sid) {
                this.error("The incoming message holds a wrong SID")
                res.status(400).err();
            }

            this.info(`Received a new message: ${req}`)
            this.processMessage(req.body)
            res.set('Content-Type', 'text/html').status(200).send(this.emptyResponse)
        });

        this.robot.router.listen(port, () => {
            this.info(`WhatAppBusiness Hubot Bot Adapter listening on localhost:'${port}'`)
        });

        // Emit 'connected' message so scripts get loaded
        this.emit("connected")
    }

    adapter.createUser = function (userPhoneNumber, apiPhoneNumber, cb) {
        let user = this.robot.brain.userForId(userPhoneNumber, { room: apiPhoneNumber })
        user.lang = 'AR'
        cb(user)
    }

    adapter.processMessage = function (message) {
        let from = this.getNumber(message.From)
        let to = this.getNumber(message.To)
        let messageId = message.MessageSid
        let text = message.Body
        if (!this.robot.brain.users[from]) {
            this.info(`a new customer ${from} has joined the line...`)
            // set default new customer incoming message
            this.createUser(from, to, (user) => {
                let msg = new TextMessage(user, text.trim(), messageId)
                this.receive(msg)
            });
        } else {
            let msg = new TextMessage(user, text.trim(), messageId)
            this.receive(msg)
        }
    }

    adapter.sendMessage = function (context, message) {
        this.info(`sending message back to ${context.user.id}: ${message}`)
        let data = qs.stringify({
            'Body': message,
            'From': this.toWhatsAppNumber(context.room),
            'To': this.toWhatsAppNumber(context.user.id)
        })
        let options = {
            auth: this.sid + ":" + this.token
        }
        let headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(data)
        }
        this.robot.http(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, options)
            .headers(headers)
            .post(data)((err, res, body) => {
                if (res.statusCode == 400) {
                    this.error(`Error sending message - Body:\n${body}\n Status:\n${res.statusCode}\n Error:\n${err}`)
                }
            })
    }

    adapter.getNumber = (address) => address.match(/whatsapp:(\+\d+)/)[1]

    adapter.toWhatsAppNumber = (number) => 'whatsapp:'.concat(number)

    adapter.send = function (envelope, ...strings) {
        this.sendMessage(envelope, strings.join('\n'))
    }

    adapter.emote = function (envelope, ...strings) {
        this.info(`Emoting to ${envelope.room}: ${strings}`)
    }

    adapter.reply = function (envelope, ...strings) {
        return strings.map(
            (str) => this.sendMessage(envelope, `${envelope.user.name}: ${str}`)
        )
    }

    adapter.topic = function (envelope, ...strings) {
        this.info(`Emoting to ${envelope.room}: ${strings}`)
    }

    adapter.info = function (message) {
        this.robot.logger.info(this.enrich(message))
    }

    adapter.error = function (message) {
        this.robot.logger.error(this.enrich(message))
    }

    adapter.debug = function (message) {
        this.robot.logger.debug(this.enrich(message))
    }

    adapter.enrich = (message) => "[hubot-whatsapp-adapter] : " + message

    return adapter;
}
