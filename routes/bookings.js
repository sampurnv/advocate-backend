const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const db = require('../config/db');

// Create booking (user only)
router.post('/', auth, checkRole('user'), async (req, res) => {
  try {
    const { advocate_id, service_id, booking_date, booking_time, service_type, notes } = req.body;

    // Validate required fields
    if (!advocate_id || !booking_date || !booking_time || !service_type) {
      return res.status(400).json({ 
        error: 'Missing required fields: advocate_id, booking_date, booking_time, and service_type are required' 
      });
    }

    // Get service details for pricing
    let total_amount = 0;
    if (service_id) {
      const [services] = await db.query('SELECT price FROM services WHERE id = ?', [service_id]);
      if (services.length > 0) {
        total_amount = services[0].price;
      }
    } else {
      // Get advocate hourly rate
      const [advocates] = await db.query('SELECT hourly_rate FROM advocates WHERE id = ?', [advocate_id]);
      if (advocates.length > 0) {
        total_amount = advocates[0].hourly_rate;
      }
    }

    const [result] = await db.query(`
      INSERT INTO bookings (user_id, advocate_id, service_id, booking_date, booking_time, 
                            service_type, total_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.id, advocate_id, service_id, booking_date, booking_time, service_type, total_amount, notes]);

    res.status(201).json({
      message: 'Booking created successfully',
      bookingId: result.insertId
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get user's bookings
router.get('/my-bookings', auth, checkRole('user'), async (req, res) => {
  try {
    const [bookings] = await db.query(`
      SELECT 
        b.*, 
        a.specialization, a.location,
        u.name as advocate_name, u.phone as advocate_phone,
        s.title as service_title
      FROM bookings b
      INNER JOIN advocates a ON b.advocate_id = a.id
      INNER JOIN users u ON a.user_id = u.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.user_id = ?
      ORDER BY b.booking_date DESC, b.booking_time DESC
    `, [req.user.id]);

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get advocate's bookings
router.get('/advocate-bookings', auth, checkRole('advocate'), async (req, res) => {
  try {
    // Get advocate ID
    const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    const [bookings] = await db.query(`
      SELECT 
        b.*, 
        u.name as user_name, u.phone as user_phone, u.email as user_email,
        s.title as service_title
      FROM bookings b
      INNER JOIN users u ON b.user_id = u.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.advocate_id = ?
      ORDER BY b.booking_date DESC, b.booking_time DESC
    `, [advocates[0].id]);

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Update booking status (advocate can update)
router.patch('/:id/status', auth, checkRole('advocate'), async (req, res) => {
  try {
    const { status } = req.body;

    // Get advocate ID
    const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
    if (advocates.length === 0) {
      return res.status(404).json({ error: 'Advocate profile not found' });
    }

    const [result] = await db.query(
      'UPDATE bookings SET status = ? WHERE id = ? AND advocate_id = ?',
      [status, req.params.id, advocates[0].id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found or unauthorized' });
    }

    res.json({ message: 'Booking status updated' });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Cancel booking (user only)
router.patch('/:id/cancel', auth, checkRole('user'), async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE bookings SET status = ? WHERE id = ? AND user_id = ?',
      ['cancelled', req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found or unauthorized' });
    }

    res.json({ message: 'Booking cancelled' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Get booking details
router.get('/:id', auth, async (req, res) => {
  try {
    const [bookings] = await db.query(`
      SELECT 
        b.*, 
        u1.name as user_name, u1.phone as user_phone, u1.email as user_email,
        u2.name as advocate_name, u2.phone as advocate_phone,
        a.specialization, a.location,
        s.title as service_title, s.description as service_description
      FROM bookings b
      INNER JOIN users u1 ON b.user_id = u1.id
      INNER JOIN advocates a ON b.advocate_id = a.id
      INNER JOIN users u2 ON a.user_id = u2.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.id = ?
    `, [req.params.id]);

    if (bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check authorization
    const booking = bookings[0];
    if (req.user.role === 'user' && booking.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (req.user.role === 'advocate') {
      const [advocates] = await db.query('SELECT id FROM advocates WHERE user_id = ?', [req.user.id]);
      if (advocates.length === 0 || booking.advocate_id !== advocates[0].id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

module.exports = router;
