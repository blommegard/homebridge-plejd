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
                    "name": "Spegel",
                    "model": "DIM-02",
                    "identifier": 11,
                    "dimming": true
                },
                {
                    "name": "Dusch",
                    "model": "DIM-02",
                    "identifier": 12,
                    "dimming": true
                },
                {
                    "name": "Handdukstork",
                    "model": "CTR-01",
                    "identifier": 13
                }
            ]
        }
    ]

                }
