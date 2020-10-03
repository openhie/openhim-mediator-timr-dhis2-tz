'use strict'
const URI = require('urijs')
const axios = require('axios')
const async = require('async')
const winston = require('winston')
const utils = require('./utils')

module.exports = function (fhirconf) {
  const config = fhirconf
  return {
    getDHIS2Facilities: (orchestrations, callback) => {
      winston.info("Scanning DHIS2 facilities")
      let limitDVS = [
        "f2fafb9a-9250-3d53-952b-87abb0e096a4",
        "d8db6389-286c-337a-afbc-fddc93a68198",
        "17e28a2f-cbba-3b12-9c07-f575ae61eb70",
        "e65ac576-0efd-39c6-8229-17c37e599fb1",
        "3cbdccf3-3ed1-33bb-aa3b-36bb1337e295",
        "c8c9aa95-d307-379f-ae4f-06076c89b77f",
        "a8ffa45b-c7d3-3446-a9ba-ea59e5ad0e37",
        "125a3ff1-26a7-3afa-8ed3-1af098fa3afb",
        "a4b1c4f4-8750-372e-9b6a-73e9cd301dc8",
        "fd95f0c5-6d7d-3bf9-9382-234169c0562b",
        "e38a0c1b-28ea-363a-ac1a-c1dda9b44536"
      ]
      let error = false
      let url = new URI(config.baseURL).segment("Location").addQuery("identifier", "tanzania-hmis|").addQuery("_count", 200).toString()

      const facilities = []
      async.whilst((callback) => {
        callback(null, url !== false)
      }, (callback) => {
        let before = new Date()
        axios.get(url, {
          withCredentials: true,
          auth: {
            username: config.username,
            password: config.password
          },
        }).then(response => {
          orchestrations.push(utils.buildOrchestration('Fetching Facilities Mapped With VIMS From FHIR Server', before, 'GET', url, '', response, response.data))
          if(!response.data || !response.data.entry) {
            error = true
            url = false
            return callback(null, url)
          }
          async.each(response.data.entry, (entry, nxtEntry) => {
            let isDVS = false
            for (const type of entry.resource.type) {
              for (const coding of type.coding) {
                if(coding.code === 'DVS') {
                  isDVS = true
                }
              }
            }
            if(isDVS) {
              return nxtEntry()
            }
            let DVSID
            let timrFacilityId
            let dhis2FacilityId
            let multiplevimsid = false
            for(let identifier of entry.resource.identifier) {
              if(identifier.type.text === 'id' && identifier.system === 'http://hfrportal.ehealth.go.tz') {
                timrFacilityId = identifier.value
              }
              if(identifier.type.text === 'id' && identifier.system === 'tanzania-hmis') {
                if(dhis2FacilityId) {
                  multiplevimsid = true
                }
                dhis2FacilityId = identifier.value
              }
            }
            for(let ext of entry.resource.extension) {
              if(ext.url === 'DistrictVaccineStore') {
                DVSID = ext.valueString
              }
            }
            if (dhis2FacilityId && limitDVS.includes(DVSID)) {
              facilities.push({
                timrFacilityId: timrFacilityId,
                timrFacilityUUID: 'urn:uuid:' + entry.resource.id,
                dhis2FacilityId: dhis2FacilityId,
                facilityName: entry.resource.name,
                multiplevimsid: multiplevimsid
              })
            }
            return nxtEntry()
          }, () => {
            const next = response.data.link.find(link => link.relation == 'next');
            if (next) {
              url = next.url;
            } else {
              url = false
            }
            return callback(null, url);
          })
        }).catch((err) => {
          winston.error('Error occured while getting resource from FHIR server');
          winston.error(err);
          error = true
          url = false
          return callback(null, url)
        })
      }, () => {
        winston.info("returning " + facilities.length + " DHIS2 facilities")
        return callback(facilities)
      })
    },

    getdhis2FacilityId: (uuid, orchestrations, callback) => {
      winston.info('Getting DHIS2 Facility ID from UUID ' + uuid)
      uuid = uuid.replace('urn:uuid:', '')
      let url = new URI(config.baseURL).segment("Location").segment(uuid).toString()
      let before = new Date()
      axios.get(url, {
        withCredentials: true,
        auth: {
          username: '',
          password: ''
        },
      }).then(response => {
        if(!response || !response.data || !response.data.identifier) {
          return callback(true)
        }
        orchestrations.push(utils.buildOrchestration('Fetching DHIS2 Facility ID From FHIR Server', before, 'GET', url.toString(), '', response, response.data))
        let dhis2FacilityId
        for(let identifier of response.data.identifier) {
          if(identifier.type.text === 'id' && identifier.system === 'tanzania-hmis') {
            dhis2FacilityId = identifier.value
          }
        }
        winston.info('Returning DHIS2 ID ' + dhis2FacilityId)
        return callback(dhis2FacilityId);
      }).catch((err) => {
        winston.error('Error occured while getting resource from FHIR server');
        winston.error(err);
        return callback(err);
      })
    }
  }
}