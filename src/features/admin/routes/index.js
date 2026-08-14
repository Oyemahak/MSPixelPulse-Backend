// src/features/admin/routes/index.js
import { Router } from 'express';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import {
  listUsers, listPending, getUser, updateUser, deleteUser,
  approveUser, rejectUser, updateRole, createUser, setUserPassword,
  listLeads, updateLead, archiveLead
} from '../controllers/admin.controller.js';
import blogEngagementAdminRoutes from '../../blogEngagement/routes/admin.js';
import { archiveContent, createContent, listContent, updateContent } from '../controllers/content.controller.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/users', listUsers);
router.get('/users/pending', listPending);
router.get('/users/:userId', getUser);
router.post('/users', createUser);
router.patch('/users/:userId', updateUser);
router.patch('/users/:userId/password', setUserPassword);
router.delete('/users/:userId', deleteUser);

// Approvals
router.patch('/users/:userId/approve', approveUser);
router.patch('/users/:userId/reject', rejectUser);   // <— add this

router.patch('/users/:userId/role', updateRole);

router.get('/leads', listLeads);
router.patch('/leads/:leadId', updateLead);
router.delete('/leads/:leadId', archiveLead);

router.get('/content/:kind', listContent);
router.post('/content/:kind', createContent);
router.patch('/content/:kind/:contentId', updateContent);
router.delete('/content/:kind/:contentId', archiveContent);

router.use('/blog-engagement', blogEngagementAdminRoutes);

export default router;
