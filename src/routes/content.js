import { Router } from 'express';
import SiteContent, { PUBLIC_SITE_CONTENT_KINDS } from '../models/SiteContent.js';

const router = Router();

router.get('/:kind', async (req, res) => {
  if (!PUBLIC_SITE_CONTENT_KINDS.includes(req.params.kind)) {
    return res.status(404).json({ message: 'Content type not found' });
  }
  const items = await SiteContent.find({
    kind: req.params.kind,
    published: true,
    archivedAt: null,
  }).select('kind key title payload displayOrder updatedAt').sort({ displayOrder: 1, createdAt: 1 }).lean();
  res.json({ items });
});

export default router;
