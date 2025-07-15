const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors()); 

const pool = new Pool({
  user: "njabulo",
  host: "localhost",
  database: "fika",
  port: 5432,
  });

app.get('/schedules', async (req, res) => {
  const query = `SELECT 
    routes.id, 
    routes.name, 
    MAX(CASE WHEN row_num = 1 THEN directions.direction END) AS direction_1,
    MAX(CASE WHEN row_num = 2 THEN directions.direction END) AS direction_2
FROM 
    routes
JOIN 
    (SELECT direction, route_id,
            ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY direction) AS row_num
     FROM directions) AS directions
ON 
    routes.id = directions.route_id
WHERE 
    routes.name != ''
GROUP BY 
    routes.id, routes.name
ORDER BY routes.id;`
  try {
    const response = await pool.query(query);
    res.json(response.rows);  
  } catch (error) {
    console.error("Error executing query", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get('/weekday_times/:id', async (req, res) => {
  const { id } = req.params
  const query = `WITH eligible_trips AS (
		SELECT trips.id AS trip_id, directions.id AS directions_id, directions.direction as direction_name
    FROM trips
    JOIN directions ON trips.direction_id = directions.id
	JOIN routes ON routes.id = directions.route_id
    WHERE routes.id = ${ id }
      AND trips.monday = true
      AND trips.tuesday = true
      AND trips.wednesday = true
      AND trips.thursday = true
      AND trips.friday = true
)

SELECT stops.name, direction_name, directions_id, stop_times.sequence, ARRAY_AGG(stop_times.arrival ORDER BY stop_times.id) AS stop_times
FROM stop_times
JOIN eligible_trips ON stop_times.trip_id = eligible_trips.trip_id
JOIN stops ON stop_times.stop_id = stops.id
GROUP BY directions_id, direction_name, stop_times.sequence, stops.name;`

  try {
    const response = await pool.query(query);
    res.json(response.rows);
  } catch (error) {
    console.error("Error executing query", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


