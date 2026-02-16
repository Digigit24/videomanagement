export async function getBuckets(req, res) {
  try {
    const buckets = process.env.ZATA_BUCKETS.split(',').map(b => b.trim());
    res.json({ buckets });
  } catch (error) {
    console.error('Error getting buckets:', error);
    res.status(500).json({ error: 'Failed to get buckets' });
  }
}
