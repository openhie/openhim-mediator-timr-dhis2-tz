'use strict';
const nodemailer = require('nodemailer');
var MongoClient = require('mongodb').MongoClient;

module.exports = function () {
  function get_credentials(callback) {
    var url = "mongodb://localhost:27017/openhim";
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        var query = { urn: "urn:uuid:7078b8b7-16b9-48cd-b8ad-38be64733d75" };
        db.collection("mediators").find(query).toArray(function(err, result) {
          if (err) throw err;
          db.close();
          return callback(result[0].config.email_notification)
        });
      });
  }
  return {
    send: function (subject,text,callback){

      nodemailer.createTestAccount((err, account) => {

        get_credentials((email_settings)=>{
          var smtp_host = email_settings.smtp_host
          var smtp_port = email_settings.smtp_port
          var smtp_secured = email_settings.smtp_secured
          var username = email_settings.username
          var password = email_settings.password
          if(smtp_secured == "No")
          smtp_secured = false
          else
          smtp_secured = true
          var emails = Object.values(email_settings.emails)
          var to = emails.join(",")
          console.log(smtp_host + " "+ smtp_port + " "+ smtp_secured + " "+ username + " "+ password + " "+ to)
          let transporter = nodemailer.createTransport({
              host: smtp_host,
              port: smtp_port,
              secure: smtp_secured,
              auth: {
                  user: username,
                  pass: password
              }
          });

          let mailOptions = {
              from: '"TZ BID Interoperability" <tzbidinteroperability@gmail.com>',
              to: to,
              subject: subject,
              text: text,
          };
          console.log(mailOptions)
          transporter.sendMail(mailOptions, (error, info) => {
              if (error) {
                  console.log(error);
                  return callback()
              }
              return callback()
          });
        })
      });
    }
  }
}
