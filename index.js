const Plejd = require('./plejd');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  
  homebridge.registerPlatform("homebridge-plejd", "plejd", PlejdPlatform, false);
}

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version

function PlejdPlatform(log, config, api) {
    var platform = this;
    this.log = log;
    this.config = config;
    this.accessories = [];

    this.api = api

    var cryptoKey = Buffer.from(config.key.replace(/-/g, ''), 'hex');

    this.plejd = new Plejd(cryptoKey, log)
    this.plejd.on('updateDevice', this.updateDeviceFromPlejd.bind(this))

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;

      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      this.api.on('didFinishLaunching', function() {
        // Setup
        for (const device of config.devices) {
          this.addAccessory(device)
        }
      }.bind(this));
    }
}

PlejdPlatform.prototype.updateDeviceFromPlejd = function(device, state, dim)  {
  var accessory = this.accessories.find( accessory => accessory.context.config.identifier === device)

  if (accessory == null) {
    return;
  }

  if (accessory.getService(Service.Lightbulb)) {
    var service = accessory.getService(Service.Lightbulb)
  } else if (accessory.getService(Service.Switch)) {
    var service = accessory.getService(Service.Switch)
  }

  service.getCharacteristic(Characteristic.On).updateValue(state);

  if(accessory.context.config.dimming && dim) {
    if (dim !== 0) {
      var dimValue = (100/255) * dim
      service.getCharacteristic(Characteristic.Brightness).updateValue(dimValue);
    } else {
      service.getCharacteristic(Characteristic.Brightness).updateValue(1);
    }
  }
}

// Function invoked when homebridge tries to restore cached accessory.
// Developer can configure accessory at here (like setup event handler).
// Update current value.
PlejdPlatform.prototype.configureAccessory = function(accessory) {
  this.log(accessory.displayName, "Configure Accessory");

  // Set the accessory to reachable if plugin can currently process the accessory,
  // otherwise set to false and update the reachability later by invoking 
  // accessory.updateReachability()
  accessory.reachable = true;

  this.attatchHandlersToAccessory(accessory)

  this.accessories.push(accessory);
}

// Sample function to show how developer can add accessory dynamically from outside event
PlejdPlatform.prototype.addAccessory = function(config) {
  var newAccessory = this.createPlejdAccessory(config)

  if (newAccessory == null) {
    return;
  }

  // Already added?
  if (this.accessories.find( accessory => accessory.UUID === newAccessory.UUID) != null) {
    return
  }

  this.log("Adding Accessory");

  this.accessories.push(newAccessory);
  this.api.registerPlatformAccessories("homebridge-plejd", "plejd", [newAccessory]);
}

PlejdPlatform.prototype.createPlejdAccessory = function(config) {
  var newAccessory = new Accessory(config.name, UUIDGen.generate(config.identifier.toString()));
  newAccessory.context.config = config;

  if (config.model === 'CTR-01') {
    newAccessory.addService(Service.Switch, config.name);
  } else if (config.model === 'DIM-01') {
    newAccessory.addService(Service.Lightbulb, config.name);
  } else if (config.model === 'DIM-02') {
    newAccessory.addService(Service.Lightbulb, config.name);
  } else {
    this.log('Unknown accessory model ' + config.model)
    return null;
  }

  this.attatchHandlersToAccessory(newAccessory);

  return newAccessory;
}

PlejdPlatform.prototype.attatchHandlersToAccessory = function(accessory) {
  var platform = this;

  accessory.on('identify', function(paired, callback) {
    platform.log(newAccessory.displayName, "Identify!!!");
    callback();
  });

  if (accessory.getService(Service.Lightbulb)) {
    var service = accessory.getService(Service.Lightbulb)
  } else if (accessory.getService(Service.Switch)) {
    var service = accessory.getService(Service.Switch)
  }

  service.getCharacteristic(Characteristic.On).on('set', function(value, callback) {
    if (value) {
      platform.plejd.turnOn(accessory.context.config.identifier)
    } else {
      platform.plejd.turnOff(accessory.context.config.identifier)
    }
    
    callback();
  });

  if(accessory.context.config.dimming) {
    service.getCharacteristic(Characteristic.Brightness).on('set', function(value, callback) {
      if (value !== 0) {
        var dimValue = Math.round((255/100) * value)
        platform.plejd.turnOn(accessory.context.config.identifier, dimValue)
      }

      callback();
    });
  }
}