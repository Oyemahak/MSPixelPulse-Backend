import { Router } from 'express';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import {
  createTicket,
  getTicket,
  listTickets,
  replyToTicket,
  updateTicket,
} from '../controllers/support.controller.js';

const router = Router();
router.use(requireAuth, requireRole(['admin', 'client']));

router.get('/', listTickets);
router.post('/', createTicket);
router.get('/:ticketId', getTicket);
router.post('/:ticketId/replies', replyToTicket);
router.patch('/:ticketId', updateTicket);

export default router;
