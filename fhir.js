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
        "bfbaf07e-12d7-3e30-bb97-be9735a8a241",
        "1fd986f5-a570-364e-8c30-2e7edca2b69b",
	"05eda041-c874-3630-b7dc-99887e7adad4",
	"88ce1df2-23cb-3097-9410-8631b6a6746a",
	"01aa650b-1290-3f03-9529-942b92d5e277",
	"0cabee54-f6d7-3372-9bda-6a781f5b7ece",
	"25c5a961-f9af-335b-bfc6-19d63ba4c601",
	"5ae4583e-b0d5-3946-a300-0ae9e980d547",
	"3b81b247-07da-3faa-b6d5-e8e8b3e248f0",
	"2872b0c6-5412-3436-acb5-108fb2db647c",
	"9b573dd9-1e72-3110-9540-8b7cd1a59df4",
	"4e29f95f-6616-3c68-b817-71e8a5dbe6d8",
	"4891c9e8-6570-3687-ad2e-3f670ab43263",
	"d1bf528e-68cc-39dc-9043-9bf9724b6754",
	"0330ab8b-8911-3d56-8b3e-148fe958f214"
      ]
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
          orchestrations.push(utils.buildOrchestration('Fetching Facilities Mapped With DHIS2 From FHIR Server', before, 'GET', url, '', response, response.data))
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
            let multipledhisid = false
            let HFRCode
            for(let identifier of entry.resource.identifier) {
              if(identifier.type.text === 'id' && identifier.system === 'http://hfrportal.ehealth.go.tz') {
                timrFacilityId = identifier.value
              }
              if(identifier.type.text === 'Fac_IDNumber' && identifier.system === 'http://hfrportal.ehealth.go.tz') {
                HFRCode = identifier.value
              }
              if(identifier.type.text === 'id' && identifier.system === 'tanzania-hmis') {
                if(dhis2FacilityId) {
                  multipledhisid = true
                }
                dhis2FacilityId = identifier.value
              }
            }
            for(let ext of entry.resource.extension) {
              if(ext.url === 'DistrictVaccineStore') {
                DVSID = ext.valueReference.reference.split("/")[1]
              }
            }
            if (HFRCode && limitDVS.includes(DVSID)) {
              facilities.push({
                timrFacilityId: timrFacilityId,
                timrFacilityUUID: 'urn:uuid:' + entry.resource.id,
                dhis2FacilityId: dhis2FacilityId,
                HFRCode,
                facilityName: entry.resource.name,
                multipledhisid: multipledhisid
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
