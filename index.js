const amqp = require('amqplib');
const uuid = require('node-uuid');

let connection;
const rabbit = {
  init(callback = () => {}, uri = process.env.RABBIT_URI || 'rabbit', attempts = 5) {
    if (connection) return callback(connection);
    amqp.connect(`amqp://${uri}`)
    .then(conn => {
      connection = conn;
      callback(connection)
    })
    .catch(error => {
      attempts > 0 ? setTimeout(() => { this.init(callback, uri, attempts--); }, 2500) : console.log(error);
    });
  },
  send(q, msg) {
    this.init(conn => {
      conn.createChannel().then(ch => ch.assertQueue(q)
        .then(() => ch.sendToQueue(q, this.wrap(msg))));
    });
  },
  receive(q, callback) {
    this.init(conn => {
      conn.createChannel().then(ch => ch.assertQueue(q)
        .then(() => {
          ch.consume(q, msg => {
            callback(this.unwrap(json));
            ch.ack(msg);
          })
        }));
    });
  },
  sendRPC(q, msg, reply) {
    this.init(conn => conn.createChannel().then(ch => {
      const correlationId = uuid();
      const tryToReply = response => {
        if (response.properties.correlationId === correlationId) {
          // console.log('This is the response from the RPC', this.unwrap(response));
          reply(this.unwrap(response));
        }
      }
      ch.assertQueue('').then(queue => {
        ch.consume(queue.queue, tryToReply, { noAck: true });
        ch.sendToQueue(q, this.wrap(msg), { correlationId, replyTo: queue.queue });
      })
    }));
  },
  receiveRPC(q) {
    this.init(conn => conn.createChannel().then(ch => {
      const reply = msg => {
        ch.sendToQueue(
          msg.properties.replyTo,
          msg.content,
          { correlationId: msg.properties.correlationId }
        )
        ch.ack(msg);
      }
      ch.assertQueue(q, { durable: false })
        .then(() => {
          ch.prefetch(1);
          ch.consume(q, reply);
        })
    }));
  },
  wrap(msg) {
    return new Buffer(JSON.stringify(msg));
  },
  unwrap(msg) {
    let json = msg.content.toString();
    try {
      json = JSON.parse(json);
    } catch (err) {
      console.log(err);
    }
    try {
      json = JSON.parse(json);
    } catch (err) {
      if (!/Unexpected token .* in JSON at position .*/.test(err.message)) {
        console.log(err);
      }
    }
    return json;
  }
}

module.exports = rabbit;
