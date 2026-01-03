const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const db = require('../config/db');

// Get dashboard statistics
router.get('/dashboard', auth, checkRole('admin'), async (req, res) => {
  try {
    // Total users
    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['user']);
    
    // Total advocates
    const [advocateCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['advocate']);
    
    // Total bookings
    const [bookingCount] = await db.query('SELECT COUNT(*) as count FROM bookings');
    
    // Pending bookings
    const [pendingCount] = await db.query('SELECT COUNT(*) as count FROM bookings WHERE status = ?', ['pending']);
    
    // Revenue (total of paid bookings)
    const [revenue] = await db.query(
      'SELECT SUM(total_amount) as total FROM bookings WHERE payment_status = ?',
      ['paid']
    );

    // Recent bookings
    const [recentBookings] = await db.query(`
      SELECT 
        b.id, b.booking_date, b.status, b.total_amount,
        u1.name as user_name,
        u2.name as advocate_name
      FROM bookings b
      INNER JOIN users u1 ON b.user_id = u1.id
      INNER JOIN advocates a ON b.advocate_id = a.id
      INNER JOIN users u2 ON a.user_id = u2.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `);

    res.json({
      totalUsers: userCount[0].count,
      totalAdvocates: advocateCount[0].count,
      totalBookings: bookingCount[0].count,
      pendingBookings: pendingCount[0].count,
      totalRevenue: revenue[0].total || 0,
      recentBookings
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all users
router.get('/users', auth, checkRole('admin'), async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT id, name, email, phone, role, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all advocates with details
router.get('/advocates', auth, checkRole('admin'), async (req, res) => {
  try {
    const [advocates] = await db.query(`
      SELECT 
        a.id, a.specialization, a.experience_years, a.location, 
        a.rating, a.total_reviews, a.is_verified, a.is_available,
        u.name, u.email, u.phone, u.created_at
      FROM advocates a
      INNER JOIN users u ON a.user_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json(advocates);
  } catch (error) {
    console.error('Error fetching advocates:', error);
    res.status(500).json({ error: 'Failed to fetch advocates' });
  }
});

// Verify advocate
router.patch('/advocates/:id/verify', auth, checkRole('admin'), async (req, res) => {
  try {
    const { is_verified } = req.body;

    await db.query(
      'UPDATE advocates SET is_verified = ? WHERE id = ?',
      [is_verified, req.params.id]
    );

    res.json({ message: 'Advocate verification status updated' });
  } catch (error) {
    console.error('Error updating verification:', error);
    res.status(500).json({ error: 'Failed to update verification' });
  }
});

// Get all bookings
router.get('/bookings', auth, checkRole('admin'), async (req, res) => {
  try {
    const [bookings] = await db.query(`
      SELECT 
        b.*,
        u1.name as user_name, u1.email as user_email,
        u2.name as advocate_name, u2.email as advocate_email
      FROM bookings b
      INNER JOIN users u1 ON b.user_id = u1.id
      INNER JOIN advocates a ON b.advocate_id = a.id
      INNER JOIN users u2 ON a.user_id = u2.id
      ORDER BY b.created_at DESC
    `);
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Delete user (and cascade delete related data)
router.delete('/users/:id', auth, checkRole('admin'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
