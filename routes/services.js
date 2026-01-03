const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const db = require('../config/db');

// Get services by advocate ID
router.get('/advocate/:advocateId', async (req, res) => {
  try {
    const [services] = await db.query(
      'SELECT * FROM services WHERE advocate_id = ? AND is_active = TRUE',
      [req.params.advocateId]
    );
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Get advocate's own services
router.get('/my-services', auth, checkRole('advocate'), async (req, res) => {
  try {
    // Get advocate ID
    const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    const [services] = await db.query(
      'SELECT * FROM services WHERE advocate_id = ? ORDER BY created_at DESC',
      [advocates[0].id]
    );
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Create service (advocate only)
router.post('/', auth, checkRole('advocate'), async (req, res) => {
  try {
    const { title, description, service_type, category, price, duration_minutes } = req.body;

    // Validate required fields
    if (!title || !description || !price || !duration_minutes) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, description, price, and duration_minutes are required' 
      });
    }

    // Get advocate ID
    const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    const [result] = await db.query(`
      INSERT INTO services (advocate_id, title, description, service_type, category, price, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      advocates[0].id, 
      title, 
      description, 
      service_type || 'both', 
      category || null, 
      price, 
      duration_minutes
    ]);

    res.status(201).json({
      message: 'Service created successfully',
      serviceId: result.insertId
    });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Failed to create service', details: error.message });
  }
});

// Update service (advocate only)
router.put('/:id', auth, checkRole('advocate'), async (req, res) => {
  try {
    const { title, description, service_type, category, price, duration_minutes, is_active } = req.body;

    // Get advocate ID
    const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    const [result] = await db.query(`
      UPDATE services 
      SET title = ?, description = ?, service_type = ?, category = ?, 
          price = ?, duration_minutes = ?, is_active = ?
      WHERE id = ? AND advocate_id = ?
    `, [title, description, service_type, category, price, duration_minutes, is_active, 
        req.params.id, advocates[0].id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Service not found or unauthorized' });
    }

    res.json({ message: 'Service updated successfully' });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service (advocate only)
router.delete('/:id', auth, checkRole('advocate'), async (req, res) => {
  try {
    // Get advocate ID
    const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    const [result] = await db.query(
      'DELETE FROM services WHERE id = ? AND advocate_id = ?',
      [req.params.id, advocates[0].id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Service not found or unauthorized' });
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

module.exports = router;
