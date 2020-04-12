
var noble = require('@abandonware/noble');
var crypto = require('crypto');
var events = require( 'events' );
var util = require('util');

module.exports = Plejd;

var PLEJD_SERVICE_UUID = '31ba000160854726be45040c957391b5';
var PLEJD_CHARACTERISTIC_DATA_UUID = '31ba000460854726be45040c957391b5';
var PLEJD_CHARACTERISTIC_LAST_DATA_UUID = '31ba000560854726be45040c957391b5';
var PLEJD_CHARACTERISTIC_AUTH_UUID = '31ba000960854726be45040c957391b5';
var PLEJD_CHARACTERISTIC_PING_UUID = '31ba000a60854726be45040c957391b5';

// 10 = all

function Plejd(key, log) {
  this.log = log

  this.key = key // Buffer

  this.pingIndex = null;
  this.connectedPeripheral = null

  noble.on('stateChange', this.stateChange.bind(this));
}

util.inherits(Plejd, events.EventEmitter);

// Lazy varaibales
Plejd.prototype.dataCharacteristic = function() {
  if (this.connectedPeripheral && this.connectedPeripheral.services.length > 0) {
    return this.connectedPeripheral.services[0].characteristics.find(function(char) {
      return char.uuid == PLEJD_CHARACTERISTIC_DATA_UUID
    })
  }
  return null
}

Plejd.prototype.addressBuffer = function() {
  if (this.connectedPeripheral) {
    return reverseBuffer(Buffer.from(String(this.connectedPeripheral.address).replace(/\:/g, ''), 'hex'))
  }
  return null
}

// Start
Plejd.prototype.stateChange = function(state) {
    if (state != 'poweredOn') {
      this.log("Stopped | " + state);
      noble.stopScanning();
    }

    this.log("Started | " + state);

    this.startConnection()
};

Plejd.prototype.startConnection = function() {
  noble.startScanning([PLEJD_SERVICE_UUID], false);
  noble.once('discover', this.discover.bind(this)); // Only once
}

Plejd.prototype.disconnect = function(callback) {
  clearInterval(this.pingIndex);

  if (this.connectedPeripheral) {
    this.log('Disconnecting peripheral');

    this.connectedPeripheral.disconnect(function(error) {
      if (error) {
        this.log('Error disconnecting peripheral')
      }
      
      this.connectedPeripheral = null;
      
      this.log('Disconnected');

      if (callback) {
        callback();
      }
    });
  } else {
    this.log('Already disconnected');
          
    if (callback) {
      callback();
    }
  }
}

Plejd.prototype.discover = function(peripheral) {
  this.log("Discovered | " + peripheral.advertisement.localName + " (" + peripheral.address + ") | RSSI " + peripheral.rssi + "dB");
  
  noble.stopScanning()

  peripheral.connect(function (error) {
    this.connectToPeripheral(peripheral, error)
  }.bind(this));
};

Plejd.prototype.connectToPeripheral = function(peripheral, error) {
  if (error) {
    this.log("Connecting failed | " + peripheral.advertisement.localName + " (" + peripheral.address + ") | " + error);
    return;
  }

  this.connectedPeripheral = peripheral;

  this.log("Connected | " + peripheral.advertisement.localName + " (" + peripheral.address + ")");

  var services = [PLEJD_SERVICE_UUID]
  var characteristics = [PLEJD_CHARACTERISTIC_DATA_UUID, PLEJD_CHARACTERISTIC_LAST_DATA_UUID, PLEJD_CHARACTERISTIC_AUTH_UUID, PLEJD_CHARACTERISTIC_PING_UUID]

  peripheral.discoverSomeServicesAndCharacteristics(services, characteristics, function (error, services, characteristics) {
    this.discovered(error, peripheral, services, characteristics)
  }.bind(this));

  peripheral.once('disconnect', function() {
    this.log('Peripheral disconnected');
    this.connectedPeripheral = null;
  }.bind(this));
};

Plejd.prototype.discovered = function(error, peripheral, services, characteristics) {
  if (error) {
    this.log("Discover failed | " + peripheral.advertisement.localName + " (" + peripheral.address + ") | " + error);
    return;
  }

  var authChar = characteristics.find(function(char) {
    return char.uuid == PLEJD_CHARACTERISTIC_AUTH_UUID
  });

  var lastDataChar = characteristics.find(function(char) {
    return char.uuid == PLEJD_CHARACTERISTIC_LAST_DATA_UUID
  });

  var pingChar = characteristics.find(function(char) {
    return char.uuid == PLEJD_CHARACTERISTIC_PING_UUID
  });

  this.plejdAuth(authChar, function() {
    this.startPlejdPing(pingChar)

    lastDataChar.subscribe(function(error) {
      if (error) {
        this.log("Error subscribing | " + error);
        return;
      }

      lastDataChar.on('data', this.gotData.bind(this));
    }.bind(this));
  }.bind(this));
};

Plejd.prototype.gotData = function(data, isNotification) {
  let decodedData = plejdEncodeDecode(this.key, this.addressBuffer(), data)

  var state = null;

  var id = parseInt(decodedData[0], 10);
  var command = decodedData.toString('hex', 3, 5)
  var argument = parseInt(decodedData.toString('hex', 5, 6), 10)

  this.log("--")
  this.log(decodedData)

  if (command === '001b') {
    // time
    var argument = parseInt(reverseBuffer(decodedData.slice(5, 9)).toString('hex'), 16)
    var date = new Date(argument * 1000)

    this.log('Time sync: ' + date.toString());
    return
  } else if (command === '0021') {
    // scene
    this.log('Trigger scene: ' + argument)
    return
  } else if (command === '00c8' || command === '0098') {
    // 00c8, 0098 = state + dim
    // state 0 or 1
    state = argument;
    var dim = parseInt(decodedData.toString('hex', 7, 8), 16);

    this.log(id + ' state: ' + state + ' dim: ' + dim);

    this.emit('updateDevice', id, state, dim)
  } else if (command === '0097') {
    // 0097 = state only
    // state 0 or 1
    state = argument;

    this.log(id + ' state: ' + state);

    this.emit('updateDevice', id, state)
    return
  }  else {
    this.log('Unknown command: ' + command + ' for device: ' + id + ' ' + (decodedData.toString('hex')));
    return
  }
}

Plejd.prototype.turnOn = function(device, brightness) {
  let char = this.dataCharacteristic();
  if (!char) { return }

  var command = (brightness != null) ? '0098' : '0097';

  var payload = Buffer.from((device).toString(16).padStart(2, '0') + '0110' + command + '01', 'hex');

  if (brightness != null) {
    payload = Buffer.concat([payload, Buffer.from(brightness.toString(16).padStart(4, '0'), 'hex')]);
  }

  let data = plejdEncodeDecode(this.key, this.addressBuffer(), payload);
  this.plejdWrite(char, data);
}

Plejd.prototype.turnOff = function(device) {
  let char = this.dataCharacteristic();
  if (!char) { return }

  let payload = Buffer.from((device).toString(16).padStart(2, '0') + '0110009700', 'hex');
  let data = plejdEncodeDecode(this.key, this.addressBuffer(), payload);
  this.plejdWrite(char, data);
}

Plejd.prototype.startPlejdPing = function(pingChar) {
  clearInterval(this.pingIndex);
  this.pingIndex = setInterval(function() {
    if (this.connectedPeripheral) {
      this.plejdPing(pingChar, function(pingOk) {
        if (pingOk === false) {
          this.disconnect(function() {
            this.startConnection();
          }.bind(this));
        }
      }.bind(this));
    } else {
      this.disconnect(function() {
        this.startConnection();
      }.bind(this));
    }
  }.bind(this), 1000 * 60 * 3);
}

// Plejd Helpers
Plejd.prototype.plejdWrite = function(dataChar, data) {
  dataChar.write(data, false, function(error) {
    if (error) {
      this.log('Error writing data | ' + error)
      return;
    }
  }.bind(this));
}

Plejd.prototype.plejdAuth = function(authChar, callback) {
  authChar.write(Buffer.from([0x00]), false, function(error) {
    if (error) {
      this.log("Error writing auth start | " + error);
    }

    authChar.read(function(error, data) {
      if (error) {
        this.log("Error reading auth | " + error);
      }

      authChar.write(plejdChalResp(this.key, data), false, function(error) {
        if (error) {
          this.log("Error writing auth chal | " + error);
        }

        callback()
      }.bind(this));
    }.bind(this));
  }.bind(this));
}

Plejd.prototype.plejdPing = function(pingChar, callback) {
  var ping = crypto.randomBytes(1);

  pingChar.write(ping, false, function(error) {
    if (error) {
      this.log("Error sending ping | " + error);
      return callback(false);
    }

    pingChar.read(function(error, pong) {
      if (error) {
        this.log("Error reading pong | " + error);
        return callback(false);
      }

      if(((ping[0] + 1) & 0xff) !== pong[0]) {
        this.log('Ping failed: ' + ping[0] + ' ' + pong[0]);
        callback(false);
      } else {
        this.log('Ping success: ' + ping[0] + ' ' + pong[0]);
        callback(true);
      }
    }.bind(this));
  }.bind(this));
}

// Plejd Utilities
function plejdChalResp(key, chal) {
  let intermediate = crypto.createHash('sha256').update(xor(key, chal)).digest()

  let part1 = intermediate.slice(0, 16)
  let part2 = intermediate.slice(16)

  return xor(part1, part2)
}

function plejdEncodeDecode(key, adressBuffer, data) {
  var buf = Buffer.concat([adressBuffer, adressBuffer, adressBuffer.subarray(0, 4)]);

  var cipher = crypto.createCipheriv('aes-128-ecb', key, '')
  cipher.setAutoPadding(false)

  var ct = cipher.update(buf).toString('hex');
  ct += cipher.final().toString('hex');
  ct = Buffer.from(ct, 'hex');

  var output = "";
  for (var i = 0, length = data.length; i < length; i++) {
    output += String.fromCharCode(data[i] ^ ct[i % 16]);
  }

  return Buffer.from(output, 'ascii');
}

// Utilities
function xor(first, second) {
  var result = Buffer.alloc(first.length)
  for (var i = 0; i < first.length; i++) {
		result[i] = first[i] ^ second[i]
  }
  return result
}

function reverseBuffer(src) {
  var buffer = Buffer.allocUnsafe(src.length)

  for (var i = 0, j = src.length - 1; i <= j; ++i, --j) {
    buffer[i] = src[j]
    buffer[j] = src[i]
  }

  return buffer
}