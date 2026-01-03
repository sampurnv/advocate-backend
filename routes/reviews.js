const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const db = require('../config/db');

// Create review (user only, after completed booking)
router.post('/', auth, checkRole('user'), async (req, res) => {
  try {
    const { booking_id, rating, comment } = req.body;

    // Check if booking exists and is completed
    const [bookings] = await db.query(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ? AND status = ?',
      [booking_id, req.user.id, 'completed']
    );

    if (bookings.length === 0) {
      return res.status(400).json({ error: 'Invalid booking or booking not completed' });
    }

    const booking = bookings[0];

    // Check if review already exists
    const [existingReviews] = await db.query(
      'SELECT id FROM reviews WHERE booking_id = ?',
      [booking_id]
    );

    if (existingReviews.length > 0) {
      return res.status(400).json({ error: 'Review already exists for this booking' });
    }

    // Create review
    await db.query(`
      INSERT INTO reviews (booking_id, user_id, advocate_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `, [booking_id, req.user.id, booking.advocate_id, rating, comment]);

    // Update advocate rating
    const [ratingResult] = await db.query(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews
      FROM reviews
      WHERE advocate_id = ?
    `, [booking.advocate_id]);

    await db.query(`
      UPDATE advocates 
      SET rating = ?, total_reviews = ?
      WHERE id = ?
    `, [ratingResult[0].avg_rating, ratingResult[0].total_reviews, booking.advocate_id]);

    res.status(201).json({ message: 'Review submitted successfully' });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Get reviews for an advocate
router.get('/advocate/:advocateId', async (req, res) => {
  try {
    const [reviews] = await db.query(`
      SELECT r.*, u.name as user_name
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.advocate_id = ?
      ORDER BY r.created_at DESC
    `, [req.params.advocateId]);

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

module.exports = router;
