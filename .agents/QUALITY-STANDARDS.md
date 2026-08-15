# Quality Standards

## Gates
1. Requirements understood
2. Existing system and `.agents/PRODUCTION-ARCHITECTURE.md` inspected
3. Design and technical plan approved
4. Implementation complete
5. Automated checks pass
6. Role-based CRUD/API workflow review passes for every affected Admin/Client/Developer capability
7. Persistence survives refresh and logout/login where the workflow writes durable state
8. File workflows verify Drive object + Files metadata + read authorization + deletion/replacement semantics
9. Manual UX/UI review passes
10. Accessibility review passes
11. Security and authorization review passes
12. Performance/quota review passes, including Google Sheets cache behavior where relevant
13. SEO/marketing review passes when relevant
14. Regression review passes
15. Production deployment approved
16. Post-deployment health and changed-workflow verification complete

A passing unit test suite or successful build is necessary but not sufficient evidence that portal CRUD works.

No agent should mark work complete before relevant gates pass.
