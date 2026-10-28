---
"create-next-hydra": patch
---

Pin the shared Node runtime to the matching Effect prerelease so fresh CLI installs start successfully instead of failing with a missing ChildProcess module. Validate packed CLI startup and composition with freshly resolved dependencies before release.
