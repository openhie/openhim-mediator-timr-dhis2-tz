'use strict'

const URI = require('urijs')
const SENDEMAIL = require('./send_email')
const send_email = SENDEMAIL()
const moment = require("moment")

exports.buildOrchestration = (name, beforeTimestamp, method, url, requestContent, res, body) => {
  let uri = new URI(url)
  if (res == undefined || res == null || res == false) {
    var statusCode = 500
    var header = JSON.stringify({
      "response_header": "Empty Header Returned"
    })
    var time = moment().format()
    send_email.send("Empty Response Data", "URL===> " + url + " Res===> " + res + " Body===> " + body + " Req===> " + requestContent + " Time===> " + time, () => {

    })
  } else if ('statusCode' in res || 'status' in res) {
    if(res.statusCode) {
      var statusCode = res.statusCode
    } else if (res.status) {
      var statusCode = res.status
    }
    var header = res.headers
  }
  if(typeof body == 'object') {
    body = JSON.stringify(body)
  }
  return {
    name: name,
    request: {
      method: method,
      body: requestContent,
      timestamp: beforeTimestamp,
      path: uri.path(),
      querystring: uri.query()

    },
    response: {
      status: statusCode,
      headers: header,
      body: body,
      timestamp: new Date()
    }
  }
}