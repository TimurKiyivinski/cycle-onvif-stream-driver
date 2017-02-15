const onvif = require('node-onvif')
const arpScanner = require('arpscan/promise')
const xs = require('xstream').default

// Requirement for arp-scan without root
// File: /etc/sudoers.d/arp-scan
// $user ALL = NOPASSWD: /usr/bin/arp-scan

function getONVIFStream (config) {
  const getStreams = addresses => addresses.map(address => {
    // TODO: Consider ability to support multiple user/pass combinations
    // Unsure how this can be implemented though
    const device = new onvif.OnvifDevice({
      xaddr: `http://${address.ip}/onvif/device_service`,
      user: config.user,
      pass: config.pass
    })
    return new Promise((resolve, reject) => {
      device.init(err => {
        if (err) {
          resolve(null)
        } else {
          try {
            resolve(Object.assign({}, address, { stream: device.getUdpStreamUrl() }))
          } catch (e) {
            resolve(null)
          }
        }
      })
    })
  })

  // Return promise with all streams
  return arpScanner(config)
    .then(data => getStreams(data)) // Create promise to get stream for specific IP
    .then(streamPromises => Promise.all(streamPromises)) // Wait for all promises to resolve
    .then(streams => streams.filter(stream => stream !== null)) // Filter out non-ONVIF devices
}

function WrapONVIFStream (config) {
  const callbacks = {}

  // Perform action
  this.call = (category, nic) => {
    getONVIFStream(Object.assign({}, config, { interface: nic })).then(data => {
      callbacks[category](data)
    })
  }

  // Set callback
  this.on = (category, callback) => {
    callbacks[category] = callback
  }
}

function makeONVIFStreamDriver (config) {
  const wrapONVIFStream = new WrapONVIFStream(config)

  function onvifStreamDriver (outgoing$) {
    outgoing$.addListener({
      next: outgoing => {
        wrapONVIFStream.call(outgoing.category, outgoing.interface)
      },
      error: () => {
      },
      complete: () => {
      }
    })

    return {
      select: streamListener => xs.create({
        start: listener => {
          wrapONVIFStream.on(streamListener, data => listener.next(data))
        },
        stop: () => {
        }
      })
    }
  }

  return onvifStreamDriver
}

module.exports = makeONVIFStreamDriver
