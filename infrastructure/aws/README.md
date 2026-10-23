# AWS alternative

Use independent ECS/Fargate tasks, an HTTPS load balancer for the gateway, private service routing with verified TLS, restricted MongoDB credentials, Secrets Manager, and encrypted backup storage. Build the same service images; use the configured supported Node runtime and explicit health checks. Deploy the React assets through an HTTPS host with a same-origin API route.

Set and verify the budget, IAM boundaries, network security groups, service URL map, health checks and rollback policy before deploying. No AWS resources were created by this implementation.
