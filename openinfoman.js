'use strict'
const URI = require('urijs')
const request = require('request')
const XmlReader = require('xml-reader')
const xmlQuery = require('xml-query')
const winston = require('winston')
const utils = require('./utils')

module.exports = function (oimconf) {
  const config = oimconf
  return {
    getDHIS2Facilities: function (orchestrations, callback) {
      var url = new URI(config.url)
        .segment('/CSD/csr/')
        .segment(config.document)
        .segment('careServicesRequest')
        .segment('/urn:openhie.org:openinfoman-hwr:stored-function:facility_get_all')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64")
      var csd_msg = `<csd:requestParams xmlns:csd="urn:ihe:iti:csd:2013">
                      <csd:otherID assigningAuthorityName="tanzania-hmis" code="id"/>
                     </csd:requestParams>`
      var options = {
        url: url.toString(),
        headers: {
          Authorization: auth,
          'Content-Type': 'text/xml'
        },
        body: csd_msg
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        orchestrations.push(utils.buildOrchestration('Fetching Facilities Mapped With DHIS2 From OpenInfoMan', before, 'GET', url.toString(), csd_msg, res, body))
        if (err) {
          return callback(err)
        }
        var ast = XmlReader.parseSync(body);
        var totalFac = xmlQuery(ast).find("facilityDirectory").children().size()
        var loopCntr = totalFac
        var facilityDirectory = xmlQuery(ast).find("facilityDirectory").children()
        var facilities = []
        for (var counter = 0; counter < totalFac; counter++) {
          var timrFacilityUUID = facilityDirectory.eq(counter).attr("entityID")
          let timrFacilityId
          let DVSID
          var facilityDetails = facilityDirectory.eq(counter).children()
          var totalDetails = facilityDirectory.eq(counter).children().size()
          var detailsLoopControl = totalDetails
          var dhis2FacilityId = 0
          var DVS = false
          for (var detailsCount = 0; detailsCount < totalDetails; detailsCount++) {
            if (facilityDetails.eq(detailsCount).attr("assigningAuthorityName") == "tanzania-hmis" &&
              facilityDetails.eq(detailsCount).attr("code") == "id"
            )
              dhis2FacilityId = facilityDetails.eq(detailsCount).text()

            if (facilityDetails.eq(detailsCount).attr("assigningAuthorityName") == "http://hfrportal.ehealth.go.tz" &&
              facilityDetails.eq(detailsCount).attr("code") == "id"
            ) {
              timrFacilityId = facilityDetails.eq(detailsCount).text()
            }
            if (facilityDetails.eq(detailsCount).has("csd:extension") && facilityDetails.eq(detailsCount).attr("type") == "DistrictVaccineStore") {
              DVSID = facilityDetails.eq(detailsCount).children().find("DistrictVaccineStore").attr("entityId")
            }
            if (facilityDetails.eq(detailsCount).has("csd:primaryName"))
              var facilityName = facilityDetails.eq(detailsCount).find("csd:primaryName").text()
            if (facilityDetails.eq(detailsCount).has("csd:extension") &&
              facilityDetails.eq(detailsCount).attr("type") == "facilityType" &&
              facilityDetails.eq(detailsCount).attr("urn") == "urn:openhie.org:openinfoman-tz" &&
              facilityDetails.eq(detailsCount).children().find("facilityType").text() == "DVS"
            ) {
              DVS = true
            }
          }
          let limitDVS = [
            "urn:uuid:f2fafb9a-9250-3d53-952b-87abb0e096a4",
            "urn:uuid:d8db6389-286c-337a-afbc-fddc93a68198",
            "urn:uuid:17e28a2f-cbba-3b12-9c07-f575ae61eb70",
            "urn:uuid:e65ac576-0efd-39c6-8229-17c37e599fb1",
            "urn:uuid:3cbdccf3-3ed1-33bb-aa3b-36bb1337e295",
            "urn:uuid:c8c9aa95-d307-379f-ae4f-06076c89b77f",
            "urn:uuid:a8ffa45b-c7d3-3446-a9ba-ea59e5ad0e37",
            "urn:uuid:125a3ff1-26a7-3afa-8ed3-1af098fa3afb",
            "urn:uuid:a4b1c4f4-8750-372e-9b6a-73e9cd301dc8",
            "urn:uuid:fd95f0c5-6d7d-3bf9-9382-234169c0562b",
            "urn:uuid:e38a0c1b-28ea-363a-ac1a-c1dda9b44536"
          ]
          // if (DVS === false && limitDVS.includes(DVSID)) {
          //   winston.error({
          //     "timrFacilityId": timrFacilityId,
          //     "timrFacilityUUID": timrFacilityUUID,
          //     "dhis2FacilityId": dhis2FacilityId,
          //     "facilityName": facilityName
          //   })
          // }
          if (DVS === false && dhis2FacilityId && limitDVS.includes(DVSID)) {
            facilities.push({
              "timrFacilityId": timrFacilityId,
              "timrFacilityUUID": timrFacilityUUID,
              "dhis2FacilityId": dhis2FacilityId,
              "facilityName": facilityName
            })
            loopCntr--
          } else {
            loopCntr--
          }
        }
        if (loopCntr == 0) {
          callback(facilities)
        }
      })
    },

    getdhis2FacilityId: function (uuid, orchestrations, callback) {
      var url = new URI(config.url)
        .segment('/CSD/csr/')
        .segment(config.document)
        .segment('careServicesRequest')
        .segment('/urn:openhie.org:openinfoman-hwr:stored-function:facility_get_all')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64")
      var csd_msg = `<csd:requestParams xmlns:csd="urn:ihe:iti:csd:2013">
                      <csd:id entityID="${uuid}"></csd:id>
                     </csd:requestParams>`
      var options = {
        url: url.toString(),
        headers: {
          Authorization: auth,
          'Content-Type': 'text/xml'
        },
        body: csd_msg
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        orchestrations.push(utils.buildOrchestration('Fetching DHIS2 Facility ID From OpenInfoMan', before, 'GET', url.toString(), csd_msg, res, body))
        if (err) {
          return callback(err)
        }
        var ast = XmlReader.parseSync(body)
        var facLength = xmlQuery(ast).find("facilityDirectory").children().find("csd:facility").children().size()
        var facility = xmlQuery(ast).find("facilityDirectory").children().find("csd:facility").children()
        var loopCntr = facLength
        var facFound = false
        for (var counter = 0; counter < facLength; counter++) {
          if (facility.eq(counter).find("csd:otherID").attr("assigningAuthorityName") == "tanzania-hmis" && facility.eq(counter).find("csd:otherID").attr("code") == "id") {
            facFound = true
            callback(facility.eq(counter).find("csd:otherID").text())
          }
          loopCntr--
        }
        if (loopCntr === 0 && facFound === false)
          callback("")
      })
    },

    getFacilityUUIDFromDhisId: function (dhisFacId, orchestrations, callback) {
      var url = new URI(config.url)
        .segment('/CSD/csr/')
        .segment(config.document)
        .segment('careServicesRequest')
        .segment('/urn:openhie.org:openinfoman-hwr:stored-function:facility_get_all')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64")
      var csd_msg = `<csd:requestParams xmlns:csd="urn:ihe:iti:csd:2013">
                      <csd:otherID assigningAuthorityName="tanzania-hmis" code="id">${dhisFacId}</csd:otherID>
                     </csd:requestParams>`
      var options = {
        url: url.toString(),
        headers: {
          'Content-Type': 'text/xml'
        },
        body: csd_msg
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        orchestrations.push(utils.buildOrchestration('Get facility UUID From DHISID', before, 'POST', url.toString(), options.body, res, body))
        if (err) {
          return callback(err)
        }
        var ast = XmlReader.parseSync(body)
        var uuid = xmlQuery(ast).find("facilityDirectory").children().attr("entityID")
        var name = xmlQuery(ast).find("facilityDirectory").children().find("csd:facility").children().find("csd:primaryName").text()
        callback(uuid, name)
      })
    },

    getOrganizationUUIDFromDhisID: function (dhisOrgId, orchestrations, callback) {
      var url = new URI(config.url)
        .segment('/CSD/csr/')
        .segment(config.document)
        .segment('careServicesRequest')
        .segment('/urn:openhie.org:openinfoman-hwr:stored-function:organization_get_all')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64")
      var csd_msg = `<csd:requestParams xmlns:csd="urn:ihe:iti:csd:2013">
                      <csd:otherID assigningAuthorityName="tanzania-hmis" code="id">${dhisOrgId}</csd:otherID>
                     </csd:requestParams>`
      var options = {
        url: url.toString(),
        headers: {
          'Content-Type': 'text/xml'
        },
        body: csd_msg
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        orchestrations.push(utils.buildOrchestration('Get organization UUID From DHIS2 ID', before, 'POST', url.toString(), options.body, res, body))
        if (err) {
          return callback(err)
        }
        var ast = XmlReader.parseSync(body)
        var uuid = xmlQuery(ast).find("organizationDirectory").children().attr("entityID")
        var name = xmlQuery(ast).find("organizationDirectory").children().find("csd:organization").children().find("csd:primaryName").text()
        callback(uuid, name)
      })
    }
  }

}