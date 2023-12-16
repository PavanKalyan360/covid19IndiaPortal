const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let app = express()
app.use(express.json())

const dbpath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDBandServer()

const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (request.path === '/login/') {
    return next()
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// API 1: login user
app.post('/login/', authenticateToken, async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
  `

  const dbUser = await db.get(selectUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)

    if (isPasswordMatched) {
      const token = jwt.sign({username}, 'MY_SECRET_TOKEN')
      response.send({token})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// API 2: Get all states
app.get('/states/', authenticateToken, async (request, response) => {
  let getStatesDetails = `
    SELECT 
      *
    FROM 
      state;`
  const statesArray = await db.all(getStatesDetails)
  response.send(
    statesArray.map(eachState =>
      convertStateDbObjectToResponseObject(eachState),
    ),
  )
})

// API 3: Get state by ID
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateDetails = `
    SELECT
        *
    FROM
        state
    WHERE
        state_id = ${stateId};`

  const state = await db.get(getStateDetails)
  response.send(convertStateDbObjectToResponseObject(state))
})

// API 4: Add a new district
app.post('/districts/', authenticateToken, async (request, response) => {
  const districtDetails = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtDetails

  const addDistrictDetails = `
      INSERT INTO
        district (district_name, state_id, cases, cured, active, deaths)
      VALUES
        ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`

  await db.run(addDistrictDetails)
  response.send('District Successfully Added')
})

// API 5: Get district by ID
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictDetails = `
    SELECT
        *
    FROM
        district
    WHERE
        district_id = ${districtId};`

    const district = await db.get(getDistrictDetails)
    response.send(convertDistrictDbObjectToResponseObject(district))
  },
)

// API 6: Delete district by ID
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrict = `
    DELETE FROM
        district
    WHERE
        district_id = ${districtId};`

    await db.run(deleteDistrict)
    response.send('District Removed')
  },
)

// API 7: Update district details by ID
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const districtDetails = request.body
    const {districtName, stateId, cases, cured, active, deaths} =
      districtDetails

    const updateDistrictDetails = `
      UPDATE
        district
      SET
        district_name = '${districtName}',
        state_id = ${stateId},  
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
      WHERE
        district_id = ${districtId};`

    await db.run(updateDistrictDetails)
    response.send('District Details Updated')
  },
)

// API 8: Get all stats
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    let getStateStatsQuery = `
    SELECT 
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM 
      district
    WHERE 
      state_id = ${stateId};`
    const stats = await db.get(getStateStatsQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

module.exports = app

