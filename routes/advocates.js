const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const db = require('../config/db');

// Get all advocates (with search and filters)
router.get('/', async (req, res) => {
  try {
    const { search, specialization, location, minRating, serviceType } = req.query;
    
    let query = `
      SELECT 
        a.id, a.user_id, a.specialization, a.experience_years, 
        a.location, a.bio, a.hourly_rate, a.rating, a.total_reviews,
        a.is_verified, a.is_available,
        u.name, u.email, u.phone
      FROM advocates a
      INNER JOIN users u ON a.user_id = u.id
      WHERE a.is_available = TRUE
    `;
    const params = [];

    if (search) {
      query += ` AND (u.name LIKE ? OR a.specialization LIKE ? OR a.location LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (specialization) {
      query += ` AND a.specialization LIKE ?`;
      params.push(`%${specialization}%`);
    }

    if (location) {
      query += ` AND a.location LIKE ?`;
      params.push(`%${location}%`);
    }

    if (minRating) {
      query += ` AND a.rating >= ?`;
      params.push(parseFloat(minRating));
    }

    query += ` ORDER BY a.rating DESC, a.total_reviews DESC`;

    const [advocates] = await db.query(query, params);

    // If serviceType filter, get advocates with matching services
    if (serviceType && advocates.length > 0) {
      const advocateIds = advocates.map(a => a.id);
      const [services] = await db.query(
        `SELECT DISTINCT advocate_id FROM services 
         WHERE advocate_id IN (?) AND (service_type = ? OR service_type = 'both')`,
        [advocateIds, serviceType]
      );
      const filteredIds = services.map(s => s.advocate_id);
      const filteredAdvocates = advocates.filter(a => filteredIds.includes(a.id));
      return res.json(filteredAdvocates);
    }

    res.json(advocates);
  } catch (error) {
    console.error('Error fetching advocates:', error);
    res.status(500).json({ error: 'Failed to fetch advocates' });
  }
});

// Get advocate by ID
router.get('/:id', async (req, res) => {
  try {
    const [advocates] = await db.query(`
      SELECT 
        a.*, u.name, u.email, u.phone
      FROM advocates a
      INNER JOIN users u ON a.user_id = u.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate not found' });
    }

    // Get services
    const [services] = await db.query(
      'SELECT * FROM services WHERE advocate_id = ? AND is_active = TRUE',
      [req.params.id]
    );

    // Get reviews
    const [reviews] = await db.query(`
      SELECT r.*, u.name as user_name
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.advocate_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [req.params.id]);

    res.json({
      ...advocates[0],
      services,
      reviews
    });
  } catch (error) {
    console.error('Error fetching advocate:', error);
    res.status(500).json({ error: 'Failed to fetch advocate' });
  }
});

// Update advocate profile (advocate only)
router.put('/profile', auth, checkRole('advocate'), async (req, res) => {
  try {
    const { 
      specialization, experience_years, bar_council_number, 
      license_number, location, bio, hourly_rate 
    } = req.body;

    const [result] = await db.query(`
      UPDATE advocates 
      SET specialization = ?, experience_years = ?, bar_council_number = ?,
          license_number = ?, location = ?, bio = ?, hourly_rate = ?
      WHERE user_id = ?
    `, [specialization, experience_years, bar_council_number, license_number, 
        location, bio, hourly_rate, req.user.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get advocate's own profile
router.get('/me/profile', auth, checkRole('advocate'), async (req, res) => {
  try {
    const [advocates] = await db.query(`
      SELECT a.*, u.name, u.email, u.phone
      FROM advocates a
      INNER JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
    `, [req.user.id]);

    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    res.json(advocates[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Toggle availability
router.patch('/availability', auth, checkRole('advocate'), async (req, res) => {
  try {
    const { is_available } = req.body;

    await db.query(
      'UPDATE advocates SET is_available = ? WHERE user_id = ?',
      [is_available, req.user.id]
    );

    res.json({ message: 'Availability updated', is_available });
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

module.exports = router;
