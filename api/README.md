## REST API - **Sports**
<p>
api for prematch and livedata.
</p>

<br />

### DOMAIN
[http://inplay.mydicegame.net/](http://inplay.mydicegame.net)

<br/>

### API ROOT
```
/api/
```

<br />

### LIMIT
<p>
<b>100</b> Request per minute
</p>

<br />

### AUTHENTICATE 
- Authentication JSON Web Token
- use `rubyTest` as user parameter.
- use any text as password.
- each token expires within 1hour(s)

*METHOD POST*
```javascript
/api/auth?user=rubyTest&password=any123
```
*Response*
```json
{
    "expires": "60 min(s)",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyS2V5IjoicnVieVRlc3QiLCJpYXQiOjE1ODE0NTc2MjcsImV4cCI6MTU4MTQ2MTIyN30.dJdfuRmf11oe1hM6JrCE4OfIYlAEaDafS1bwXLdTkVA"
}
```
---

<br />

### CHECK AUTHENTICATE
- Check remaining time for the token to expired.
- params [*token*, *user*, *password*]

*METHOD POST*
```javascript
/api/check?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyS2V5IjoicnVieVRlc3QiLCJpYXQiOjE1ODEzMTgxMTAsImV4cCI6MTU4MTMyMTcxMH0&user=rubyTest&password=12345
```
*Response*
```json
{
    "status": 200,
    "message": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyS2V5IjoicnVieVRlc3QiLCJpYXQiOjE1ODE0NTc2MjcsImV4cCI6MTU4MTQ2MTIyN30.dJdfuRmf11oe1hM6JrCE4OfIYlAEaDafS1bwXLdTkVA",
        "ttl": 958
    }
}
```

<br />
<br />

## END POINTS :

---
### Livedata & Prematch
- To send request. you need to set the **x-access-token** on your header request.
- get the token: `/api/auth/:user`
---

<br />

### Get Fixture
- Get event fixture. types: **livedata** **prematch**.

*METHOD GET*
```javascript
/api/livedata/1234567/fixture
```

```javascript
/api/prematch/1234567/fixture
```

*Response*
```json
{
    "fixture_id": 5162711,
    "is_manual": false,
    "dateupdated": 1581454151499,
    "status": 2,
    "is_locked": false,
    "startdate": "2020-02-11T19:15:00",
    "location": {
        "id": 213,
        "name": "Iceland"
    },
    "sport": {
        "id": 48242,
        "name": "Basketball",
        "league": {
            "id": 23330,
            "name": "Division 1"
        }
    },
    "participants": {
        "home": {
            "id": 52336492,
            "name": "Alftanes"
        },
        "away": {
            "id": 52336494,
            "name": "Hottur"
        }
    }
}
```
---

<br />

### Get Livescore
- Get livescores. types: **livedata** **prematch**.

*METHOD GET*
```javascript
/api/livedata/1234567/livescore
```

```javascript
/api/prematch/1234567/livescore
```
---

<br />

### Get Markets
- Get all markets. types: **livedata** **prematch**.

*METHOD GET*
```javascript
/api/livedata/1234567/markets
```

```javascript
/api/prematch/1234567/markets
```
*Response*
```json
[
    {
        "market_live_idx": 2,
        "market_sub_id": 0,
        "market_id": 2,
        "market_name_mobile_icon": "O/U",
        "market_name_kr": "오버언더",
        "market_name_en": "OVER UNDER",
        "game_type": "",
        "r_type": "",
        ...
    },
    ...
]
```
---

<br />

### Get Market
- Get specific market. types: **livedata** **prematch**.

*METHOD GET*
```javascript
/api/livedata/1234567/markets/226
```

```javascript
/api/prematch/1234567/markets/226
```
*Response*
```json
{
    "market_live_idx": 2,
    "market_sub_id": 0,
    "market_id": 2,
    "market_name_mobile_icon": "O/U",
    "market_name_kr": "오버언더",
    "market_name_en": "OVER UNDER",
    "game_type": "",
    "r_type": "",
    ...
}
```


