// backend/src/routes/index.js
import { Router } from "express";

// Existing feature mounts
import authFeatureRoutes from "../features/auth/routes/index.js";
import adminFeatureRoutes from "../features/admin/routes/index.js";
import projectFeatureRoutes from "../features/projects/routes/index.js";
import debugRoutes from "../features/debug/routes/index.js";
import {
  getPublicProject,
  listPublicProjects,
} from "../features/projects/controllers/project.controller.js";

// Chat & directory
import directoryRoutes from "./directory.js";
import dmRoutes from "./dm.js";
import roomsRoutes from "./rooms.js";

// Admin audit (optional)
import adminAuditRoutes from "./admin-audit.js";

// Files uploader + invoices (ensure these modules export their own base paths)
import filesRoutes from "./files.routes.js";
import invoiceRoutes from "./invoice.routes.js";

// NEW: user profile routes (avatar)
import userProfileRoutes from "../features/users/routes/index.js";
import leadRoutes from "../features/leads/routes/index.js";
import blogEngagementRoutes from "../features/blogEngagement/routes/index.js";
import contentRoutes from "./content.js";
import supportRoutes from "../features/support/routes/index.js";

const router = Router();

// Auth
router.use("/auth", authFeatureRoutes);

// Admin feature
router.use("/admin", adminFeatureRoutes);

// Projects (list/detail)
router.get("/public/projects", listPublicProjects);
router.get("/public/projects/:slug", getPublicProject);
router.use("/projects", projectFeatureRoutes);

// Directory + chat
router.use("/directory", directoryRoutes);
router.use("/dm", dmRoutes);
router.use("/rooms", roomsRoutes);

// Admin audit
router.use("/admin-audit", adminAuditRoutes);

// Other mounts
router.use(filesRoutes);
router.use(invoiceRoutes);

// NEW: users (me/avatar)
router.use("/users", userProfileRoutes);

// Public lead capture and blog engagement
router.use("/contact", leadRoutes);
router.use("/blog-engagement", blogEngagementRoutes);
router.use("/content", contentRoutes);
router.use("/support", supportRoutes);

// Debug maintenance routes are disabled unless ENABLE_DEBUG_ROUTES=true.
router.use("/debug", debugRoutes);

export default router;
