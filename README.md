# homebridge-plejd
Homebridge plugin for Plejd

#### Example configuration:
```json
"platforms": [
        {
            "platform": "plejd",
            "key": "82-82-91-3E-90-F1-4A-42-C0-84-B7-CB-A4-2B-91-FD",
            "devices": [
                {
                    "name": "Mirror",
                    "model": "DIM-02",
                    "identifier": 11,
                    "dimming": true
                },
                {
                    "name": "Shower",
                    "model": "DIM-02",
                    "identifier": 12,
                    "dimming": true
                },
                {
                    "name": "Towel Dryer",
                    "model": "CTR-01",
                    "identifier": 13
                }
            ]
        }
    ]
```
## Thanks

Big thanks to [@klali](https://github.com/klali) (https://github.com/klali/ha-plejd) and [@emilohman](https://github.com/emilohman) (https://github.com/emilohman/node-red-contrib-plejd) for their Plejd related projects, this would not be possible without it.
