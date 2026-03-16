# Déploiement en Production - MCP Smart Proxy

Ce document décrit comment déployer MCP Smart Proxy en production avec Docker.

## 🐳 Déploiement avec Docker

### 1. Construction de l'image

```bash
# Construire l'image Docker
docker build -t mcp-smart-proxy:latest .

# Ou utiliser le script npm
npm run docker:build
```

### 2. Exécution simple

```bash
# Exécuter avec volume persistant
docker run -d \
  --name mcp-smart-proxy \
  -p 3000:3000 \
  -v mcp-data:/data \
  -e MCP_PROXY_PORT=3000 \
  -e MCP_OPTIMIZATION_ENABLED=true \
  mcp-smart-proxy:latest

# Ou utiliser le script npm
npm run docker:run
```

### 3. Déploiement avec Docker Compose (Recommandé)

```bash
# Démarrer tous les services
docker-compose up -d

# Vérifier l'état
docker-compose ps

# Voir les logs
docker-compose logs -f mcp-smart-proxy

# Arrêter les services
docker-compose down

# Arrêter et supprimer les volumes
docker-compose down -v
```

## 🔧 Configuration Docker Compose

### Services inclus :

1. **mcp-smart-proxy** - Proxy principal
2. **mcp-filesystem** - Serveur MCP filesystem (sidecar)
3. **mcp-github** - Serveur MCP GitHub (sidecar)
4. **prometheus** - Monitoring (optionnel)
5. **grafana** - Dashboard (optionnel)
6. **traefik** - Reverse proxy (optionnel)

### Volumes persistants :

- **mcp-data** : Stockage des vecteurs et index
- **prometheus-data** : Métriques Prometheus
- **grafana-data** : Dashboards Grafana

## 🌐 Configuration réseau

Le Docker Compose crée un réseau `mcp-smart-proxy-network` avec le sous-réseau `172.20.0.0/16`.

Les services communiquent via :
- **mcp-smart-proxy** : Port 3000 exposé
- **Services sidecar** : Ports internes seulement (8080, 8081, etc.)

## 🏥 Health Checks

Le conteneur inclut un health check qui vérifie :

1. **Serveur HTTP** répond sur `/health`
2. **Mémoire vectorielle** initialisée
3. **Espace disque** disponible (>100MB)
4. **Configuration** valide
5. **Modèle d'embedding** disponible

Statut des health checks :
```bash
# Vérifier manuellement
docker inspect --format='{{.State.Health.Status}}' mcp-smart-proxy

# Ou utiliser curl
curl http://localhost:3000/health
```

## 📊 Monitoring

### Métriques disponibles :

1. **Endpoint Prometheus** : `http://localhost:3000/metrics/prometheus`
2. **Dashboard Grafana** : `http://localhost:3001` (admin/admin)
3. **Dashboard intégré** : `http://localhost:3000/dashboard`

### Métriques clés à surveiller :

- `mcp_tokens_saved_percent` - Pourcentage de tokens économisés
- `mcp_response_time_ms` - Temps de réponse
- `mcp_cache_hit_rate` - Taux de succès du cache
- `mcp_server_connections` - Connexions aux serveurs MCP
- `mcp_vector_memory_items` - Nombre d'items en mémoire vectorielle

## 🔒 Sécurité

### Variables d'environnement sensibles :

```bash
# Fichier .env (ne pas commiter)
GITHUB_TOKEN=your_github_token_here
GRAFANA_PASSWORD=secure_password_here
```

### Bonnes pratiques :

1. **Utiliser des secrets Docker** pour les tokens
2. **Limiter les ports exposés**
3. **Mettre à jour régulièrement** les images
4. **Surveiller les logs** pour détecter les anomalies
5. **Sauvegarder les volumes** régulièrement

## 📈 Scaling

### Scaling horizontal :

```yaml
# docker-compose.scale.yml
services:
  mcp-smart-proxy:
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
    healthcheck:
      # Health check plus agressif pour le scaling
      interval: 10s
      timeout: 5s
      retries: 3
```

### Load balancing :

Utiliser Traefik ou Nginx pour répartir la charge entre les réplicas.

## 🗄️ Persistance des données

### Structure des données :

```
/data/
├── vector-index/          # Index vectoriel Vectra
├── logs/                 # Logs d'application
└── cache/               # Cache des modèles
```

### Sauvegarde :

```bash
# Sauvegarder le volume
docker run --rm -v mcp-data:/source -v $(pwd)/backups:/backup alpine \
  tar czf /backup/mcp-data-$(date +%Y%m%d).tar.gz -C /source .

# Restaurer
docker run --rm -v mcp-data:/target -v $(pwd)/backups:/backup alpine \
  tar xzf /backup/mcp-data-20240316.tar.gz -C /target
```

## 🚨 Dépannage

### Problèmes courants :

1. **Health check échoue** :
   ```bash
   # Vérifier les logs
   docker-compose logs mcp-smart-proxy
   
   # Vérifier l'espace disque
   docker exec mcp-smart-proxy df -h /data
   ```

2. **Connexions MCP échouent** :
   ```bash
   # Vérifier les services sidecar
   docker-compose ps
   
   # Tester la connectivité
   docker exec mcp-smart-proxy nc -zv mcp-filesystem 8080
   ```

3. **Performances lentes** :
   ```bash
   # Vérifier l'utilisation mémoire
   docker stats mcp-smart-proxy
   
   # Vider le cache
   docker exec mcp-smart-proxy npm run maintenance -- --clear-cache
   ```

### Logs :

```bash
# Logs en temps réel
docker-compose logs -f

# Logs avec filtrage
docker-compose logs mcp-smart-proxy | grep -i error

# Logs structurés (format JSON)
docker-compose exec mcp-smart-proxy cat /app/logs/proxy.log | jq .
```

## 🚀 Déploiement sur le cloud

### AWS ECS :

```bash
# Créer un repository ECR
aws ecr create-repository --repository-name mcp-smart-proxy

# Pousser l'image
docker tag mcp-smart-proxy:latest \
  123456789012.dkr.ecr.region.amazonaws.com/mcp-smart-proxy:latest
docker push 123456789012.dkr.ecr.region.amazonaws.com/mcp-smart-proxy:latest
```

### Kubernetes :

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-smart-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-smart-proxy
  template:
    metadata:
      labels:
        app: mcp-smart-proxy
    spec:
      containers:
      - name: proxy
        image: mcp-smart-proxy:latest
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: mcp-data
          mountPath: /data
        env:
        - name: MCP_PROXY_PORT
          value: "3000"
      volumes:
      - name: mcp-data
        persistentVolumeClaim:
          claimName: mcp-data-pvc
```

## 📞 Support

En cas de problème :

1. **Consulter les logs** : `docker-compose logs`
2. **Vérifier la santé** : `curl http://localhost:3000/health`
3. **Consulter la documentation** : [README.md](./README.md)
4. **Ouvrir une issue** : [GitHub Issues](https://github.com/Mourad95/MCP-smart-proxy/issues)

---

**Statut du déploiement** : ✅ **PRÊT POUR LA PRODUCTION**

Le projet inclut maintenant :
- Dockerfile multi-étape optimisé
- Docker Compose avec sidecars
- Health checks complets
- Monitoring intégré
- Persistance des données
- Documentation de déploiement