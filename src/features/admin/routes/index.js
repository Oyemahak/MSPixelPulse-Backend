// src/features/admin/routes/index.js
import { Router } from 'express';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import {
  listUsers, listPending, getUser, updateUser, deleteUser,
  approveUser, rejectUser, updateRole, createUser
} from '../controllers/admin.controller.js';
import blogEngagementAdminRoutes from '../../blogEngagement/routes/admin.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/users', listUsers);
router.get('/users/pending', listPending);
router.get('/users/:userId', getUser);
router.post('/users', createUser);
router.patch('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);

// Approvals
router.patch('/users/:userId/approve', approveUser);
router.patch('/users/:userId/reject', rejectUser);   // <— add this

router.patch('/users/:userId/role', updateRole);

router.use('/blog-engagement', blogEngagementAdminRoutes);

export default router;
