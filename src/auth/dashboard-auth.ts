/**
 * Dashboard Authentication Middleware
 * 
 * Provides Basic Auth protection for the React dashboard
 * using environment variable DASHBOARD_PASSWORD
 */

import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

export interface AuthConfig {
  password?: string
  jwtSecret?: string
  jwtExpiresIn?: string
}

export class DashboardAuth {
  private config: AuthConfig
  private tokens: Set<string> = new Set()
  
  constructor(config: AuthConfig = {}) {
    this.config = {
      password: process.env.DASHBOARD_PASSWORD,
      jwtSecret: process.env.DASHBOARD_JWT_SECRET || crypto.randomBytes(32).toString('hex'),
      jwtExpiresIn: '24h',
      ...config
    }
  }
  
  /**
   * Check if authentication is required
   */
  isAuthRequired(): boolean {
    return !!this.config.password && this.config.password.length > 0
  }
  
  /**
   * Generate JWT token
   */
  generateToken(): string {
    if (!this.config.jwtSecret) {
      throw new Error('JWT secret not configured')
    }
    
    const token = jwt.sign(
      { 
        type: 'dashboard',
        timestamp: Date.now()
      },
      this.config.jwtSecret!,
      { expiresIn: this.config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
    )
    
    this.tokens.add(token)
    return token
  }
  
  /**
   * Verify JWT token
   */
  verifyToken(token: string): boolean {
    if (!this.config.jwtSecret) {
      return false
    }
    
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as any
      
      // Check if token is still valid (in our set)
      if (!this.tokens.has(token)) {
        return false
      }
      
      // Check token type
      if (decoded.type !== 'dashboard') {
        return false
      }
      
      return true
    } catch (error) {
      // Token is invalid or expired
      this.tokens.delete(token)
      return false
    }
  }
  
  /**
   * Invalidate token (logout)
   */
  invalidateToken(token: string): void {
    this.tokens.delete(token)
  }
  
  /**
   * Cleanup expired tokens
   */
  cleanupExpiredTokens(): void {
    if (!this.config.jwtSecret) {
      return
    }
    
    for (const token of this.tokens) {
      try {
        jwt.verify(token, this.config.jwtSecret)
      } catch {
        this.tokens.delete(token)
      }
    }
  }
  
  /**
   * Create Express middleware for authentication
   */
  createMiddleware() {
    const router = express.Router()
    
    // Status endpoint (public)
    router.get('/auth/status', (req, res) => {
      return res.json({
        requiresAuth: this.isAuthRequired(),
        hasPassword: !!this.config.password
      })
    })
    
    // Login endpoint
    router.post('/auth/login', (req, res) => {
      const { password } = req.body
      
      if (!this.isAuthRequired()) {
        // No password configured, generate token anyway
        const token = this.generateToken()
        return res.json({ 
          success: true, 
          token,
          message: 'Authentication not required'
        })
      }
      
      if (!password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password is required' 
        })
      }
      
      if (password !== this.config.password) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid password' 
        })
      }
      
      const token = this.generateToken()
      return res.json({ 
        success: true, 
        token,
        expiresIn: this.config.jwtExpiresIn
      })
    })
    
    // Verify token endpoint
    router.get('/auth/verify', (req, res) => {
      const authHeader = req.headers.authorization
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          success: false, 
          message: 'No token provided' 
        })
      }
      
      const token = authHeader.substring(7)
      
      if (this.verifyToken(token)) {
        return res.json({ 
          success: true,
          valid: true
        })
      } else {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid or expired token' 
        })
      }
    })
    
    // Logout endpoint
    router.post('/auth/logout', (req, res) => {
      const authHeader = req.headers.authorization
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        this.invalidateToken(token)
      }
      
      res.json({ 
        success: true, 
        message: 'Logged out successfully' 
      })
    })
    
    // Authentication middleware for protected routes
    const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Skip auth if no password configured
      if (!this.isAuthRequired()) {
        return next()
      }
      
      const authHeader = req.headers.authorization
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        })
      }
      
      const token = authHeader.substring(7)
      
      if (this.verifyToken(token)) {
        next()
      } else {
        res.status(401).json({ 
          success: false, 
          message: 'Invalid or expired token' 
        })
      }
    }
    
    // Dashboard API routes (protected)
    router.use('/dashboard', authMiddleware, (req, res, next) => {
      // Add security headers for dashboard
      res.set({
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block'
      })
      next()
    })
    
    // Cleanup expired tokens periodically
    setInterval(() => {
      this.cleanupExpiredTokens()
    }, 3600000) // Every hour
    
    return router
  }
  
  /**
   * Create simple basic auth middleware (alternative)
   * This middleware protects routes when DASHBOARD_PASSWORD is set
   * If no password is configured, access is unrestricted (development mode)
   */
  createBasicAuthMiddleware() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Skip auth if no password configured (development mode)
      if (!this.isAuthRequired()) {
        return next()
      }
      
      const authHeader = req.headers.authorization
      
      // Check for Bearer token (JWT) first
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        if (this.verifyToken(token)) {
          return next()
        }
      }
      
      // Check for Basic auth
      if (authHeader && authHeader.startsWith('Basic ')) {
        const base64Credentials = authHeader.substring(6)
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
        const [username, password] = credentials.split(':')
        
        // Basic auth with empty username (just password)
        if (password === this.config.password) {
          return next()
        }
      }
      
      // No valid authentication found
      res.set('WWW-Authenticate', 'Basic realm="MCP Proxy Dashboard"')
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        requiresAuth: true,
        hasPassword: !!this.config.password
      })
    }
  }
  
  /**
   * Get authentication configuration
   */
  getConfig(): AuthConfig {
    return { ...this.config }
  }
}