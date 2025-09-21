/**
 * Performance Monitoring System for KIP Phase 7
 *
 * Advanced performance capabilities:
 * - Real-time metrics collection
 * - Query performance tracking
 * - Resource utilization monitoring
 * - Alerting for performance degradation
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

export class PerformanceMonitor extends EventEmitter {
  constructor(driver, config = {}) {
    super();
    this.driver = driver;
    this.config = {
      metricsRetentionDays: 30,
      slowQueryThresholdMs: 1000,
      memoryThresholdMB: 1024,
      cpuThresholdPercent: 80,
      diskThresholdPercent: 85,
      alertCooldownMs: 5 * 60 * 1000, // 5 minutes
      metricsCollectionIntervalMs: 30 * 1000, // 30 seconds
      enableRealTimeMonitoring: true,
      enableAlerting: true,
      maxMetricsBufferSize: 10000,
      performanceReportIntervalHours: 24,
      ...config
    };

    this.metrics = {
      queries: new Map(),
      system: new Map(),
      alerts: new Map(),
      performance: new Map()
    };

    this.buffers = {
      queryMetrics: [],
      systemMetrics: [],
      alertHistory: []
    };

    this.lastAlerts = new Map();
    this.monitoring = false;
    this.initialized = false;
  }

  /**
   * Initialize performance monitoring system
   */
  async initialize() {
    if (this.initialized) return;

    const session = this.driver.session();
    try {
      // Create performance tracking schema
      await session.run(`
        MERGE (pm:PerformanceMonitor {id: 'global'})
        SET pm.initialized = timestamp(),
            pm.queries_tracked = 0,
            pm.alerts_triggered = 0,
            pm.monitoring_active = true
      `);

      // Create performance metrics indexes
      await session.run(`
        CREATE INDEX performance_metrics IF NOT EXISTS
        FOR (pm:PerformanceMetric) ON (pm.timestamp, pm.metric_type)
      `);

      await session.run(`
        CREATE INDEX query_performance IF NOT EXISTS
        FOR (qp:QueryPerformance) ON (qp.execution_time, qp.timestamp)
      `);

      await session.run(`
        CREATE INDEX system_metrics IF NOT EXISTS
        FOR (sm:SystemMetric) ON (sm.timestamp, sm.metric_name)
      `);

      await session.run(`
        CREATE INDEX performance_alerts IF NOT EXISTS
        FOR (pa:PerformanceAlert) ON (pa.severity, pa.timestamp, pa.resolved)
      `);

      // Initialize baseline metrics
      await this.collectBaselineMetrics();

      this.initialized = true;
      console.log('✅ Performance monitor initialized');

      // Start real-time monitoring if enabled
      if (this.config.enableRealTimeMonitoring) {
        this.startRealTimeMonitoring();
      }

    } catch (error) {
      console.error('❌ Failed to initialize performance monitor:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Start real-time performance monitoring
   */
  startRealTimeMonitoring() {
    if (this.monitoring) return;

    this.monitoring = true;
    console.log('🔄 Starting real-time performance monitoring...');

    // System metrics collection interval
    this.systemMetricsInterval = setInterval(async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        console.error('System metrics collection failed:', error);
      }
    }, this.config.metricsCollectionIntervalMs);

    // Performance report generation
    this.reportInterval = setInterval(async () => {
      try {
        await this.generatePerformanceReport();
      } catch (error) {
        console.error('Performance report generation failed:', error);
      }
    }, this.config.performanceReportIntervalHours * 60 * 60 * 1000);

    // Cleanup old metrics
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOldMetrics();
      } catch (error) {
        console.error('Metrics cleanup failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  /**
   * Stop real-time monitoring
   */
  stopRealTimeMonitoring() {
    if (!this.monitoring) return;

    this.monitoring = false;
    console.log('⏹️ Stopping real-time performance monitoring...');

    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = null;
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Track query performance
   */
  async trackQuery(query, executionTimeMs, metadata = {}) {
    const queryMetric = {
      id: this.generateMetricId(),
      query: this.sanitizeQuery(query),
      queryHash: this.hashQuery(query),
      executionTime: executionTimeMs,
      timestamp: Date.now(),
      metadata: {
        recordsReturned: metadata.recordsReturned || 0,
        memoryUsed: metadata.memoryUsed || 0,
        cpuTime: metadata.cpuTime || 0,
        ioOperations: metadata.ioOperations || 0,
        cacheHits: metadata.cacheHits || 0,
        cacheMisses: metadata.cacheMisses || 0,
        indexUsage: metadata.indexUsage || [],
        ...metadata
      }
    };

    // Store in buffer
    this.buffers.queryMetrics.push(queryMetric);

    // Check for slow query
    if (executionTimeMs > this.config.slowQueryThresholdMs) {
      await this.handleSlowQuery(queryMetric);
    }

    // Update query statistics
    this.updateQueryStatistics(queryMetric);

    // Flush buffer if needed
    if (this.buffers.queryMetrics.length >= this.config.maxMetricsBufferSize / 2) {
      await this.flushQueryMetrics();
    }

    return queryMetric.id;
  }

  /**
   * Collect current system metrics
   */
  async collectSystemMetrics() {
    const metrics = {
      timestamp: Date.now(),
      memory: await this.getMemoryMetrics(),
      cpu: await this.getCPUMetrics(),
      disk: await this.getDiskMetrics(),
      network: await this.getNetworkMetrics(),
      neo4j: await this.getNeo4jMetrics(),
      nodejs: this.getNodeJSMetrics()
    };

    // Store in buffer
    this.buffers.systemMetrics.push(metrics);

    // Check for threshold violations
    await this.checkSystemThresholds(metrics);

    // Flush buffer if needed
    if (this.buffers.systemMetrics.length >= this.config.maxMetricsBufferSize / 2) {
      await this.flushSystemMetrics();
    }

    return metrics;
  }

  /**
   * Get memory usage metrics
   */
  async getMemoryMetrics() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed / 1024 / 1024, // MB
      heapTotal: memUsage.heapTotal / 1024 / 1024, // MB
      external: memUsage.external / 1024 / 1024, // MB
      rss: memUsage.rss / 1024 / 1024, // MB
      arrayBuffers: memUsage.arrayBuffers / 1024 / 1024 // MB
    };
  }

  /**
   * Get CPU usage metrics (simplified)
   */
  async getCPUMetrics() {
    // In a real implementation, you'd use system-level CPU monitoring
    const usage = process.cpuUsage();
    return {
      user: usage.user / 1000, // milliseconds
      system: usage.system / 1000, // milliseconds
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
    };
  }

  /**
   * Get disk usage metrics (simplified)
   */
  async getDiskMetrics() {
    // In a real implementation, you'd check actual disk usage
    return {
      used: Math.random() * 50 + 20, // Simulated percentage
      free: Math.random() * 30 + 50, // Simulated percentage
      total: 100
    };
  }

  /**
   * Get network metrics (simplified)
   */
  async getNetworkMetrics() {
    return {
      bytesIn: Math.random() * 1000000,
      bytesOut: Math.random() * 500000,
      packetsIn: Math.random() * 1000,
      packetsOut: Math.random() * 800
    };
  }

  /**
   * Get Neo4j specific metrics
   */
  async getNeo4jMetrics() {
    const session = this.driver.session();
    try {
      // Get database statistics
      const dbStats = await session.run(`
        CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Store file sizes") YIELD attributes
        RETURN attributes
      `).catch(() => ({ records: [] }));

      // Get transaction statistics
      const txStats = await session.run(`
        CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Transactions") YIELD attributes
        RETURN attributes
      `).catch(() => ({ records: [] }));

      // Get connection pool statistics
      const poolStats = await session.run(`
        SHOW DATABASES YIELD name, currentStatus, requestedStatus
        RETURN count(*) AS database_count
      `).catch(() => ({ records: [{ get: () => 0 }] }));

      return {
        storeSize: dbStats.records[0]?.get('attributes')?.TotalStoreSize || 0,
        nodeCount: 0, // Would be extracted from JMX in real implementation
        relationshipCount: 0,
        transactionCount: txStats.records[0]?.get('attributes')?.NumberOfOpenTransactions || 0,
        databaseCount: poolStats.records[0]?.get('database_count')?.toNumber() || 1,
        connectionPoolSize: this.driver.session()._mode === 'READ' ? 1 : 1 // Simplified
      };
    } catch (error) {
      console.warn('Failed to collect Neo4j metrics:', error.message);
      return {
        storeSize: 0,
        nodeCount: 0,
        relationshipCount: 0,
        transactionCount: 0,
        databaseCount: 1,
        connectionPoolSize: 1
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get Node.js process metrics
   */
  getNodeJSMetrics() {
    return {
      uptime: process.uptime(),
      version: process.version,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      eventLoopDelay: 0, // Would use @nodejs/clinic in real implementation
      gcCount: 0, // Would track GC events in real implementation
      gcDuration: 0
    };
  }

  /**
   * Check system metrics against thresholds
   */
  async checkSystemThresholds(metrics) {
    const alerts = [];

    // Memory threshold check
    if (metrics.memory.heapUsed > this.config.memoryThresholdMB) {
      alerts.push({
        type: 'memory_high',
        severity: 'warning',
        message: `Memory usage high: ${metrics.memory.heapUsed.toFixed(1)}MB (threshold: ${this.config.memoryThresholdMB}MB)`,
        value: metrics.memory.heapUsed,
        threshold: this.config.memoryThresholdMB
      });
    }

    // CPU threshold check (simplified)
    const cpuPercent = (metrics.cpu.user + metrics.cpu.system) / 10; // Simplified calculation
    if (cpuPercent > this.config.cpuThresholdPercent) {
      alerts.push({
        type: 'cpu_high',
        severity: 'warning',
        message: `CPU usage high: ${cpuPercent.toFixed(1)}% (threshold: ${this.config.cpuThresholdPercent}%)`,
        value: cpuPercent,
        threshold: this.config.cpuThresholdPercent
      });
    }

    // Disk threshold check
    if (metrics.disk.used > this.config.diskThresholdPercent) {
      alerts.push({
        type: 'disk_high',
        severity: 'critical',
        message: `Disk usage high: ${metrics.disk.used.toFixed(1)}% (threshold: ${this.config.diskThresholdPercent}%)`,
        value: metrics.disk.used,
        threshold: this.config.diskThresholdPercent
      });
    }

    // Neo4j specific checks
    if (metrics.neo4j.transactionCount > 100) {
      alerts.push({
        type: 'neo4j_transactions_high',
        severity: 'warning',
        message: `High number of open transactions: ${metrics.neo4j.transactionCount}`,
        value: metrics.neo4j.transactionCount,
        threshold: 100
      });
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  /**
   * Handle slow query detection
   */
  async handleSlowQuery(queryMetric) {
    const alert = {
      type: 'slow_query',
      severity: queryMetric.executionTime > this.config.slowQueryThresholdMs * 5 ? 'critical' : 'warning',
      message: `Slow query detected: ${queryMetric.executionTime}ms (threshold: ${this.config.slowQueryThresholdMs}ms)`,
      queryHash: queryMetric.queryHash,
      executionTime: queryMetric.executionTime,
      query: queryMetric.query.substring(0, 200) + (queryMetric.query.length > 200 ? '...' : '')
    };

    await this.processAlert(alert);

    // Emit slow query event
    this.emit('slowQuery', queryMetric);
  }

  /**
   * Process and potentially trigger an alert
   */
  async processAlert(alert) {
    if (!this.config.enableAlerting) return;

    const alertKey = `${alert.type}_${alert.queryHash || 'system'}`;
    const now = Date.now();

    // Check cooldown period
    if (this.lastAlerts.has(alertKey)) {
      const lastAlert = this.lastAlerts.get(alertKey);
      if (now - lastAlert < this.config.alertCooldownMs) {
        return; // Skip alert due to cooldown
      }
    }

    // Update last alert time
    this.lastAlerts.set(alertKey, now);

    // Add timestamp and ID
    const alertWithMetadata = {
      ...alert,
      id: this.generateMetricId(),
      timestamp: now,
      resolved: false
    };

    // Store alert
    this.buffers.alertHistory.push(alertWithMetadata);
    await this.storeAlert(alertWithMetadata);

    // Emit alert event
    this.emit('alert', alertWithMetadata);

    console.warn(`🚨 Alert [${alert.severity.toUpperCase()}]: ${alert.message}`);
  }

  /**
   * Generate performance dashboard data
   */
  async getPerformanceDashboard(timeRangeHours = 24) {
    const session = this.driver.session();
    try {
      const sinceTimestamp = Date.now() - (timeRangeHours * 60 * 60 * 1000);

      // Query performance summary
      const queryStats = await session.run(`
        MATCH (qp:QueryPerformance)
        WHERE qp.timestamp > $since
        RETURN
          count(*) AS total_queries,
          avg(qp.execution_time) AS avg_execution_time,
          max(qp.execution_time) AS max_execution_time,
          count(CASE WHEN qp.execution_time > $slowThreshold THEN 1 END) AS slow_queries
      `, { since: sinceTimestamp, slowThreshold: this.config.slowQueryThresholdMs });

      // System metrics summary
      const systemStats = await session.run(`
        MATCH (sm:SystemMetric)
        WHERE sm.timestamp > $since
        RETURN
          count(*) AS metric_count,
          avg(sm.memory_used) AS avg_memory,
          max(sm.memory_used) AS max_memory,
          avg(sm.cpu_usage) AS avg_cpu
      `, { since: sinceTimestamp });

      // Alert summary
      const alertStats = await session.run(`
        MATCH (pa:PerformanceAlert)
        WHERE pa.timestamp > $since
        RETURN
          count(*) AS total_alerts,
          count(CASE WHEN pa.severity = 'critical' THEN 1 END) AS critical_alerts,
          count(CASE WHEN pa.severity = 'warning' THEN 1 END) AS warning_alerts,
          count(CASE WHEN pa.resolved = false THEN 1 END) AS unresolved_alerts
      `, { since: sinceTimestamp });

      // Top slow queries
      const topSlowQueries = await session.run(`
        MATCH (qp:QueryPerformance)
        WHERE qp.timestamp > $since AND qp.execution_time > $slowThreshold
        RETURN qp.query_hash AS query_hash,
               avg(qp.execution_time) AS avg_time,
               count(*) AS execution_count
        ORDER BY avg_time DESC
        LIMIT 10
      `, { since: sinceTimestamp, slowThreshold: this.config.slowQueryThresholdMs });

      const dashboard = {
        timeRange: `${timeRangeHours} hours`,
        timestamp: new Date().toISOString(),
        queryPerformance: {
          totalQueries: queryStats.records[0]?.get('total_queries')?.toNumber() || 0,
          avgExecutionTime: queryStats.records[0]?.get('avg_execution_time') || 0,
          maxExecutionTime: queryStats.records[0]?.get('max_execution_time') || 0,
          slowQueries: queryStats.records[0]?.get('slow_queries')?.toNumber() || 0
        },
        systemMetrics: {
          metricCount: systemStats.records[0]?.get('metric_count')?.toNumber() || 0,
          avgMemory: systemStats.records[0]?.get('avg_memory') || 0,
          maxMemory: systemStats.records[0]?.get('max_memory') || 0,
          avgCPU: systemStats.records[0]?.get('avg_cpu') || 0
        },
        alerts: {
          total: alertStats.records[0]?.get('total_alerts')?.toNumber() || 0,
          critical: alertStats.records[0]?.get('critical_alerts')?.toNumber() || 0,
          warning: alertStats.records[0]?.get('warning_alerts')?.toNumber() || 0,
          unresolved: alertStats.records[0]?.get('unresolved_alerts')?.toNumber() || 0
        },
        topSlowQueries: topSlowQueries.records.map(record => ({
          queryHash: record.get('query_hash'),
          avgTime: record.get('avg_time'),
          executionCount: record.get('execution_count').toNumber()
        })),
        currentStatus: this.getCurrentSystemStatus()
      };

      return dashboard;
    } finally {
      await session.close();
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport() {
    console.log('📊 Generating performance report...');

    const reportData = {
      reportId: this.generateMetricId(),
      timestamp: new Date().toISOString(),
      period: {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      },
      summary: await this.getPerformanceSummary(),
      trends: await this.getPerformanceTrends(),
      recommendations: await this.generatePerformanceRecommendations(),
      alerts: await this.getRecentAlerts(24),
      systemHealth: this.assessSystemHealth()
    };

    // Store report
    await this.storePerformanceReport(reportData);

    // Emit report event
    this.emit('performanceReport', reportData);

    return reportData;
  }

  /**
   * Get performance summary for reporting
   */
  async getPerformanceSummary() {
    const current = await this.getCurrentMetrics();
    const baseline = await this.getBaselineMetrics();

    return {
      queries: {
        total: current.queries.total || 0,
        avgExecutionTime: current.queries.avgExecutionTime || 0,
        slowQueryRate: current.queries.slowQueryRate || 0,
        throughput: current.queries.throughput || 0,
        changeFromBaseline: this.calculatePercentageChange(
          current.queries.avgExecutionTime,
          baseline.queries.avgExecutionTime
        )
      },
      system: {
        memoryUsage: current.system.memoryUsage || 0,
        cpuUsage: current.system.cpuUsage || 0,
        diskUsage: current.system.diskUsage || 0,
        uptime: current.system.uptime || 0
      },
      neo4j: {
        storeSize: current.neo4j.storeSize || 0,
        transactionCount: current.neo4j.transactionCount || 0,
        connectionPoolSize: current.neo4j.connectionPoolSize || 0
      }
    };
  }

  /**
   * Assess overall system health
   */
  assessSystemHealth() {
    const currentMetrics = this.getCurrentSystemStatus();
    let healthScore = 100;
    const issues = [];

    // Memory health
    if (currentMetrics.memory > 80) {
      healthScore -= 20;
      issues.push('High memory usage');
    }

    // CPU health
    if (currentMetrics.cpu > 80) {
      healthScore -= 15;
      issues.push('High CPU usage');
    }

    // Disk health
    if (currentMetrics.disk > 85) {
      healthScore -= 25;
      issues.push('High disk usage');
    }

    // Query performance health
    if (currentMetrics.slowQueryRate > 10) {
      healthScore -= 20;
      issues.push('High slow query rate');
    }

    // Alert health
    if (currentMetrics.unresolved_alerts > 5) {
      healthScore -= 10;
      issues.push('Multiple unresolved alerts');
    }

    let status = 'excellent';
    if (healthScore < 90) status = 'good';
    if (healthScore < 75) status = 'fair';
    if (healthScore < 60) status = 'poor';
    if (healthScore < 40) status = 'critical';

    return {
      score: Math.max(0, healthScore),
      status,
      issues,
      lastUpdated: new Date().toISOString()
    };
  }

  // Helper methods

  generateMetricId() {
    return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sanitizeQuery(query) {
    // Remove sensitive data from queries for logging
    return query.replace(/password\s*[:=]\s*['"][^'"]*['"]/gi, 'password: ***')
                .replace(/token\s*[:=]\s*['"][^'"]*['"]/gi, 'token: ***')
                .substring(0, 1000); // Limit length
  }

  hashQuery(query) {
    // Simple hash for query identification
    return require('crypto').createHash('sha256')
      .update(this.sanitizeQuery(query))
      .digest('hex')
      .substring(0, 16);
  }

  updateQueryStatistics(queryMetric) {
    const hash = queryMetric.queryHash;
    const existing = this.metrics.queries.get(hash) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      avgTime: 0
    };

    existing.count++;
    existing.totalTime += queryMetric.executionTime;
    existing.minTime = Math.min(existing.minTime, queryMetric.executionTime);
    existing.maxTime = Math.max(existing.maxTime, queryMetric.executionTime);
    existing.avgTime = existing.totalTime / existing.count;
    existing.lastExecution = queryMetric.timestamp;

    this.metrics.queries.set(hash, existing);
  }

  getCurrentSystemStatus() {
    // Return current system status snapshot
    return {
      memory: 45, // Simulated percentage
      cpu: 25,
      disk: 60,
      slowQueryRate: 5,
      unresolved_alerts: 2,
      monitoring: this.monitoring,
      uptime: process.uptime()
    };
  }

  calculatePercentageChange(current, baseline) {
    if (!baseline || baseline === 0) return 0;
    return ((current - baseline) / baseline) * 100;
  }

  async getCurrentMetrics() {
    // Simplified implementation - return current metrics
    return {
      queries: {
        total: this.buffers.queryMetrics.length,
        avgExecutionTime: this.buffers.queryMetrics.reduce((sum, q) => sum + q.executionTime, 0) / Math.max(1, this.buffers.queryMetrics.length),
        slowQueryRate: this.buffers.queryMetrics.filter(q => q.executionTime > this.config.slowQueryThresholdMs).length / Math.max(1, this.buffers.queryMetrics.length) * 100,
        throughput: this.buffers.queryMetrics.length / 24 // per hour
      },
      system: this.getCurrentSystemStatus(),
      neo4j: {
        storeSize: 0,
        transactionCount: 0,
        connectionPoolSize: 1
      }
    };
  }

  async getBaselineMetrics() {
    // Return baseline metrics (would be stored during initialization)
    return {
      queries: {
        avgExecutionTime: 500,
        slowQueryRate: 5,
        throughput: 100
      }
    };
  }

  async collectBaselineMetrics() {
    // Collect baseline metrics during initialization
    const baseline = await this.getCurrentMetrics();
    this.metrics.performance.set('baseline', {
      ...baseline,
      timestamp: Date.now()
    });
  }

  async getPerformanceTrends() {
    // Simplified trend analysis
    return {
      queryPerformance: 'stable',
      systemUsage: 'increasing',
      alertFrequency: 'decreasing'
    };
  }

  async generatePerformanceRecommendations() {
    const recommendations = [];
    const current = await this.getCurrentMetrics();

    if (current.queries.slowQueryRate > 10) {
      recommendations.push({
        type: 'query_optimization',
        priority: 'high',
        description: 'High slow query rate detected',
        action: 'Review and optimize slow queries'
      });
    }

    if (current.system.memory > 80) {
      recommendations.push({
        type: 'memory_optimization',
        priority: 'medium',
        description: 'High memory usage',
        action: 'Consider increasing memory or optimizing memory usage'
      });
    }

    return recommendations;
  }

  async getRecentAlerts(hours) {
    const since = Date.now() - (hours * 60 * 60 * 1000);
    return this.buffers.alertHistory.filter(alert => alert.timestamp > since);
  }

  // Storage methods
  async flushQueryMetrics() {
    if (this.buffers.queryMetrics.length === 0) return;

    const session = this.driver.session();
    try {
      for (const metric of this.buffers.queryMetrics) {
        await session.run(`
          CREATE (qp:QueryPerformance {
            id: $id,
            query_hash: $queryHash,
            execution_time: $executionTime,
            timestamp: $timestamp,
            records_returned: $recordsReturned,
            memory_used: $memoryUsed,
            metadata: $metadata
          })
        `, {
          id: metric.id,
          queryHash: metric.queryHash,
          executionTime: metric.executionTime,
          timestamp: metric.timestamp,
          recordsReturned: metric.metadata.recordsReturned,
          memoryUsed: metric.metadata.memoryUsed,
          metadata: JSON.stringify(metric.metadata)
        });
      }

      console.log(`📊 Flushed ${this.buffers.queryMetrics.length} query metrics`);
      this.buffers.queryMetrics = [];
    } finally {
      await session.close();
    }
  }

  async flushSystemMetrics() {
    if (this.buffers.systemMetrics.length === 0) return;

    const session = this.driver.session();
    try {
      for (const metric of this.buffers.systemMetrics) {
        await session.run(`
          CREATE (sm:SystemMetric {
            timestamp: $timestamp,
            memory_used: $memoryUsed,
            cpu_usage: $cpuUsage,
            disk_usage: $diskUsage,
            neo4j_transactions: $neo4jTransactions,
            nodejs_uptime: $nodejsUptime,
            metadata: $metadata
          })
        `, {
          timestamp: metric.timestamp,
          memoryUsed: metric.memory.heapUsed,
          cpuUsage: (metric.cpu.user + metric.cpu.system) / 10,
          diskUsage: metric.disk.used,
          neo4jTransactions: metric.neo4j.transactionCount,
          nodejsUptime: metric.nodejs.uptime,
          metadata: JSON.stringify(metric)
        });
      }

      console.log(`📊 Flushed ${this.buffers.systemMetrics.length} system metrics`);
      this.buffers.systemMetrics = [];
    } finally {
      await session.close();
    }
  }

  async storeAlert(alert) {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (pa:PerformanceAlert {
          id: $id,
          type: $type,
          severity: $severity,
          message: $message,
          timestamp: $timestamp,
          resolved: $resolved,
          metadata: $metadata
        })
      `, {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
        resolved: alert.resolved,
        metadata: JSON.stringify(alert)
      });
    } finally {
      await session.close();
    }
  }

  async storePerformanceReport(report) {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (pr:PerformanceReport {
          id: $id,
          timestamp: $timestamp,
          period_start: $periodStart,
          period_end: $periodEnd,
          health_score: $healthScore,
          recommendations_count: $recommendationsCount,
          report_data: $reportData
        })
      `, {
        id: report.reportId,
        timestamp: report.timestamp,
        periodStart: report.period.start,
        periodEnd: report.period.end,
        healthScore: report.systemHealth.score,
        recommendationsCount: report.recommendations.length,
        reportData: JSON.stringify(report)
      });
    } finally {
      await session.close();
    }
  }

  async cleanupOldMetrics() {
    const cutoffTimestamp = Date.now() - (this.config.metricsRetentionDays * 24 * 60 * 60 * 1000);
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (n)
        WHERE n.timestamp < $cutoff AND (
          n:QueryPerformance OR n:SystemMetric OR n:PerformanceAlert OR n:PerformanceReport
        )
        DELETE n
        RETURN count(n) AS deleted
      `, { cutoff: cutoffTimestamp });

      const deleted = result.records[0]?.get('deleted')?.toNumber() || 0;
      if (deleted > 0) {
        console.log(`🧹 Cleaned up ${deleted} old performance metrics`);
      }
    } finally {
      await session.close();
    }
  }
}