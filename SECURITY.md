# Security Documentation - MCP Smart Proxy

## 🔒 Security Overview

MCP Smart Proxy is designed with security as a core principle. This document outlines the security features, best practices, and recommendations for secure deployment.

## 🛡️ Security Features

### 1. **Secret Masking**
The proxy automatically detects and masks sensitive information in MCP server responses:

**Detected Secrets:**
- API keys (`sk-*`, `AKIA*`, `ghp_*`)
- Authentication tokens (Bearer tokens, JWT)
- Database connection strings
- Email addresses (partially masked)
- Credit card numbers
- SSH private keys

**Example:**
```json
// Before masking:
{
  "api_key": "sk-1234567890abcdef",
  "database_url": "postgres://user:password@localhost/db"
}

// After masking:
{
  "api_key": "[REDACTED_API_KEY]",
  "database_url": "[REDACTED_DATABASE_URL]"
}
```

**Configuration:**
```bash
# Enable/disable secret masking
MCP_SECRET_MASKING_ENABLED=true
```

**Implementation note:** The "secrets detected" count is incremented per string field that contained at least one match, not per occurrence. Use it for coarse monitoring only, not as a precise security metric.

### 2. **Environment Validation**
Strict validation of environment variables at startup:

```bash
# Missing required variables cause immediate failure
MCP_PROXY_PORT=3000  # Required
MCP_VECTOR_MEMORY_PATH=/data/vector-index  # Required

# Invalid values are rejected
MCP_MAX_CONTEXT_TOKENS=50000  # Error: must be ≤ 10000
```

**Validation includes:**
- Required variable presence
- Type validation (string, number, boolean, URL, port)
- Range validation (ports 1-65535, token limits)
- Format validation (GitHub tokens, API keys)
- Custom validation rules

### 3. **Graceful Shutdown & Data Persistence**
Proper handling of termination signals ensures data integrity:

```typescript
// On SIGTERM/SIGINT:
1. Backup vector memory to disk
2. Save optimization statistics
3. Complete pending operations
4. Exit cleanly
```

**Backup locations:**
- Vector memory: `/data/backups/vector-backup-*.json`
- Statistics: `/data/backups/stats-backup-*.json`

### 4. **Rate Limiting**
Protection against abuse and DoS attacks:

```bash
# Configure rate limits (applied via express-rate-limit on HTTP/API)
MCP_RATE_LIMIT_REQUESTS=100  # Requests per window per IP
MCP_RATE_LIMIT_WINDOW_MS=60000  # 1 minute window
```

### 5. **Dashboard authentication**
- Tokens are stored in memory (invalidated on restart). Suitable for internal/single-user use.
- No RBAC or per-role permissions; dashboard access is all-or-nothing.

### 6. **Input Validation & Sanitization**
- All MCP requests are validated against schemas
- JSON parsing with size limits
- Path traversal prevention
- SQL injection protection (where applicable)

## 🔐 Secure Deployment

### Docker Security

**1. Non-root User:**
```dockerfile
# Dockerfile uses non-root user
USER mcp
```

**2. Read-only Filesystem:**
```yaml
# docker-compose.yml
volumes:
  - ./config:/app/config:ro  # Read-only config
```

**3. Resource Limits:**
```yaml
services:
  mcp-smart-proxy:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
```

**4. Network Segmentation:**
```yaml
networks:
  mcp-network:
    internal: true  # Internal network only
```

### Environment Security

**1. Secrets Management:**
```bash
# Use Docker secrets or environment files
echo "GITHUB_TOKEN=ghp_xxxxxxxxxxxx" > .env
docker run --env-file .env mcp-smart-proxy

# Or use Docker secrets
echo "ghp_xxxxxxxxxxxx" | docker secret create github_token -
```

**2. Regular Rotation:**
- Rotate API tokens every 90 days
- Update Docker images monthly
- Review access logs weekly

**3. Audit Logging:**
```bash
# Enable detailed logging
MCP_LOG_LEVEL=debug
MCP_AUDIT_LOGGING=true

# Log locations:
/data/logs/proxy.log
/data/logs/security.log
/data/logs/audit.log
```

## 🚨 Threat Mitigation

### Common Threats & Protections

| Threat | Protection | Implementation |
|--------|------------|----------------|
| **API Key Leakage** | Secret Masking | Automatic detection & redaction |
| **DoS Attacks** | Rate Limiting | Request limiting per IP |
| **Data Corruption** | Graceful Shutdown | Signal handling & backups |
| **Configuration Errors** | Environment Validation | Startup validation |
| **Privilege Escalation** | Non-root Container | Docker user isolation |
| **Data Exfiltration** | Network Segmentation | Internal Docker networks |
| **Log Injection** | Structured Logging | JSON logging with sanitization |

### Security Headers

The proxy includes security headers in HTTP responses:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
X-Secrets-Masked: true  # Custom header when secrets are detected
```

## 📊 Security Monitoring

### Built-in Monitoring

1. **Secret Detection Alerts:**
   ```json
   {
     "level": "warn",
     "message": "Secrets detected and masked",
     "secretCount": 3,
     "secretTypes": ["api_key", "jwt_token", "database_url"],
     "timestamp": "2026-03-16T13:10:00Z"
   }
   ```

2. **Rate Limit Violations:**
   ```json
   {
     "level": "warn",
     "message": "Rate limit exceeded",
     "ip": "192.168.1.100",
     "requests": 150,
     "limit": 100
   }
   ```

3. **Error Tracking:**
   - Uncaught exceptions
   - Unhandled promise rejections
   - Validation errors
   - Connection failures

### External Monitoring Integration

**Prometheus Metrics:**
```bash
# Security-related metrics
mcp_secrets_detected_total
mcp_rate_limit_violations_total
mcp_security_errors_total
mcp_backup_success_total
```

**Grafana Dashboard:**
- Security events over time
- Secret detection trends
- Rate limit violations
- Backup success rates

## 🔧 Security Configuration

### Production Security Checklist

- [ ] **Secrets Management**
  - [ ] Use Docker secrets or vault
  - [ ] Never commit secrets to git
  - [ ] Rotate tokens regularly

- [ ] **Network Security**
  - [ ] Use internal Docker networks
  - [ ] Configure firewalls
  - [ ] Enable TLS/HTTPS

- [ ] **Container Security**
  - [ ] Use non-root user
  - [ ] Regular image updates
  - [ ] Resource limits

- [ ] **Monitoring & Logging**
  - [ ] Enable audit logging
  - [ ] Monitor security events
  - [ ] Regular log review

- [ ] **Backup & Recovery**
  - [ ] Regular backups
  - [ ] Test restore procedures
  - [ ] Off-site backups

### Configuration Examples

**Secure Docker Compose:**
```yaml
version: '3.8'
services:
  mcp-smart-proxy:
    image: mcp-smart-proxy:latest
    user: "1000:1000"  # Non-root UID/GID
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    networks:
      - internal-network

networks:
  internal-network:
    internal: true
```

**Environment File (.env.production):**
```bash
# Security Settings
MCP_SECRET_MASKING_ENABLED=true
MCP_RATE_LIMIT_REQUESTS=100
MCP_LOG_LEVEL=warn
MCP_AUDIT_LOGGING=true

# Network Security
MCP_PROXY_PORT=3000
MCP_ALLOWED_ORIGINS=https://your-domain.com

# Data Protection
MCP_VECTOR_MEMORY_PATH=/data/vector-index
MCP_BACKUP_ENABLED=true
MCP_BACKUP_INTERVAL_HOURS=24
```

## 🆘 Incident Response

### Security Incident Checklist

1. **Detection**
   - Review security logs
   - Check secret detection alerts
   - Monitor rate limit violations

2. **Containment**
   - Block offending IPs
   - Rotate compromised tokens
   - Isolate affected systems

3. **Investigation**
   - Preserve logs and evidence
   - Analyze attack vectors
   - Identify root cause

4. **Recovery**
   - Restore from backups
   - Apply security patches
   - Update configurations

5. **Prevention**
   - Update security policies
   - Enhance monitoring
   - Conduct security review

### Emergency Contacts

- **Security Issues**: security@openclaw.ai
- **GitHub Security**: https://github.com/Mourad95/mcp-smart-proxy/security
- **Docker Security**: Scan images with `docker scan`

## 📚 References

### Security Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

### Tools & Resources
- **Docker Bench Security**: `docker run --rm --net host --pid host -v /var/run/docker.sock:/var/run/docker.sock docker/docker-bench-security`
- **Trivy Vulnerability Scanner**: `trivy image mcp-smart-proxy:latest`
- **Snyk Container Security**: `snyk container test mcp-smart-proxy:latest`

### Updates & Patches
- Subscribe to security advisories
- Monitor CVE databases
- Regular dependency updates (`npm audit`, `npm update`)

---

**Last Updated**: 2026-03-16  
**Security Contact**: security@openclaw.ai  
**Version**: 1.0.0

> **Disclaimer**: This document provides security guidance but does not guarantee complete security. Regular security assessments and updates are required for production deployments.