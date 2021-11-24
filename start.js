const forever = require('forever-monitor');
const SENDEMAIL = require('./send_email')
const send_email = SENDEMAIL()
const moment = require('moment')

var child = new(forever.Monitor)('index.js', {
  append: true,
  silent: false,
  logFile: "/var/log/timr_dhis2/forever.log",
  outFile: "/var/log/timr_dhis2/info.log",
  errFile: "/var/log/timr_dhis2/error.log",
  command: 'node --max_old_space_size=2000',
  args: []
});

child.on('restart', function () {
  console.log('index.js has been restarted');
  var time = moment().format()
  send_email.send("TImR-VIMS Mediator Restarted", "The mediator was restarted on " + time, () => {

  })
});

child.on('exit', function () {
  console.log('Timr-VIMS Mediator has stoped');
  var time = moment().format()
  send_email.send("TImR-VIMS Mediator Restarted", "The mediator was restarted on " + time, () => {

  })
});

child.start();
