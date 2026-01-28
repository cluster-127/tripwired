//! Tripwired Kernel - Deterministic Kill-Switch for Autonomous Agents
//!
//! Optimized for Windows: Named Pipes (faster than TCP), TLS-free HTTP,
//! pre-compiled regex, aggressive connection pooling.

mod audit;
mod filter;
mod llm;

use audit::{AuditTrail, ModelFingerprint};
use clap::Parser;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;
use tracing::{error, info, warn};

#[cfg(windows)]
use tokio::net::windows::named_pipe::ServerOptions;

#[cfg(unix)]
use tokio::net::UnixListener;

const PIPE_NAME: &str = r"\\.\pipe\tripwired-sock";

/// Tripwired Kernel - Deterministic Kill-Switch
#[derive(Parser, Debug)]
#[command(name = "tripwired")]
#[command(about = "Kill-switch kernel for autonomous agents")]
struct Args {
    /// LLM API endpoint
    #[arg(long, default_value = "http://localhost:1234/v1")]
    llm_url: String,

    /// Model name
    #[arg(long, default_value = "llama-3.2-3b-instruct")]
    model: String,

    /// Target process PID to kill on KILL decision
    #[arg(long)]
    target_pid: Option<u32>,

    /// Max tokens for LLM response
    #[arg(long, default_value = "30")]
    max_tokens: u32,

    /// Audit log file path
    #[arg(long, default_value = "tripwired-audit.jsonl")]
    audit_log: PathBuf,

    /// Use TCP instead of Named Pipe (for compatibility)
    #[arg(long)]
    tcp: bool,

    /// TCP port (only used with --tcp)
    #[arg(long, default_value = "9999")]
    port: u16,
}

#[derive(Debug, Clone)]
pub struct KernelConfig {
    pub llm_url: String,
    pub model: String,
    pub max_tokens: u32,
    pub target_pid: Option<u32>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("tripwired=info".parse()?),
        )
        .init();

    let args = Args::parse();

    let config = Arc::new(KernelConfig {
        llm_url: args.llm_url.clone(),
        model: args.model.clone(),
        max_tokens: args.max_tokens,
        target_pid: args.target_pid,
    });

    // Create LLM client ONCE (connection pooling)
    let llm_client = Arc::new(llm::LlmClient::new(
        &config.llm_url,
        &config.model,
        config.max_tokens,
    ));

    // Create audit trail
    let model_fingerprint =
        ModelFingerprint::new(&config.model, &config.llm_url, config.max_tokens, 0.0);

    let audit_trail = Arc::new(
        AuditTrail::new(
            args.audit_log.clone(),
            model_fingerprint.clone(),
            llm::LlmClient::prompt_template(),
        )
        .expect("Failed to create audit trail"),
    );

    // Stats tracking
    let stats = Arc::new(Mutex::new(Stats::default()));

    info!("═══════════════════════════════════════════════════════════════");
    info!("  TRIPWIRED KERNEL v0.1.1 — Rust Execution Engine");
    info!("═══════════════════════════════════════════════════════════════");
    info!("  LLM endpoint: {}", config.llm_url);
    info!("  Model: {}", config.model);
    info!("  Model fingerprint: {}", model_fingerprint.fingerprint());
    info!("  Audit log: {}", args.audit_log.display());
    if let Some(pid) = config.target_pid {
        info!("  Target PID: {}", pid);
    }

    if args.tcp {
        info!("  Mode: TCP (port {})", args.port);
        info!("═══════════════════════════════════════════════════════════════");
        run_tcp_server(args.port, config, llm_client, audit_trail, stats).await
    } else {
        info!("  Mode: Named Pipe ({})", PIPE_NAME);
        info!("═══════════════════════════════════════════════════════════════");
        #[cfg(windows)]
        {
            run_named_pipe_server(config, llm_client, audit_trail, stats).await
        }
        #[cfg(unix)]
        {
            run_unix_socket_server(config, llm_client, audit_trail, stats).await
        }
    }
}

/// TCP Server (fallback mode)
async fn run_tcp_server(
    port: u16,
    config: Arc<KernelConfig>,
    llm_client: Arc<llm::LlmClient>,
    audit_trail: Arc<AuditTrail>,
    stats: Arc<Mutex<Stats>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tokio::net::TcpListener;

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port)).await?;
    info!("🎯 TCP Ready for connections...");

    loop {
        let (socket, addr) = listener.accept().await?;
        info!("📡 Connection from: {}", addr);

        let config = Arc::clone(&config);
        let llm_client = Arc::clone(&llm_client);
        let audit_trail = Arc::clone(&audit_trail);
        let stats = Arc::clone(&stats);

        tokio::spawn(async move {
            let reader = BufReader::new(socket);
            process_connection(reader, config, llm_client, audit_trail, stats).await;
            info!("📡 Connection closed");
        });
    }
}

/// Windows Named Pipe Server (fast IPC)
#[cfg(windows)]
async fn run_named_pipe_server(
    config: Arc<KernelConfig>,
    llm_client: Arc<llm::LlmClient>,
    audit_trail: Arc<AuditTrail>,
    stats: Arc<Mutex<Stats>>,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("🎯 Named Pipe Ready...");

    loop {
        // Create pipe server
        let server = ServerOptions::new()
            .first_pipe_instance(true)
            .create(PIPE_NAME);

        let server = match server {
            Ok(s) => s,
            Err(_) => {
                // Pipe exists, create another instance
                ServerOptions::new().create(PIPE_NAME)?
            }
        };

        info!("💤 Waiting for connection...");
        server.connect().await?;
        info!("⚡ Client connected!");

        let config = Arc::clone(&config);
        let llm_client = Arc::clone(&llm_client);
        let audit_trail = Arc::clone(&audit_trail);
        let stats = Arc::clone(&stats);

        // Process in current task (single client mode for now)
        let reader = BufReader::new(server);
        process_connection(reader, config, llm_client, audit_trail, stats).await;
        info!("🔌 Connection lost, resetting pipe...");
    }
}

/// Unix Socket Server (Linux/macOS)
#[cfg(unix)]
async fn run_unix_socket_server(
    config: Arc<KernelConfig>,
    llm_client: Arc<llm::LlmClient>,
    audit_trail: Arc<AuditTrail>,
    stats: Arc<Mutex<Stats>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = "/tmp/tripwired.sock";
    let _ = std::fs::remove_file(socket_path);
    let listener = UnixListener::bind(socket_path)?;
    info!("🎯 Unix Socket Ready at {}...", socket_path);

    loop {
        let (socket, _) = listener.accept().await?;
        info!("⚡ Client connected!");

        let config = Arc::clone(&config);
        let llm_client = Arc::clone(&llm_client);
        let audit_trail = Arc::clone(&audit_trail);
        let stats = Arc::clone(&stats);

        tokio::spawn(async move {
            let reader = BufReader::new(socket);
            process_connection(reader, config, llm_client, audit_trail, stats).await;
            info!("🔌 Connection closed");
        });
    }
}

/// Process incoming log lines
async fn process_connection<R: tokio::io::AsyncRead + Unpin>(
    reader: BufReader<R>,
    config: Arc<KernelConfig>,
    llm_client: Arc<llm::LlmClient>,
    audit_trail: Arc<AuditTrail>,
    stats: Arc<Mutex<Stats>>,
) {
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let start = std::time::Instant::now();

        // Pre-filter (microseconds)
        if !filter::is_suspicious(&line) {
            let elapsed = start.elapsed();
            let mut s = stats.lock().await;
            s.filtered += 1;

            // Record filtered decision
            let _ = audit_trail.record(
                &line,
                "SUSTAIN",
                100,
                true,
                elapsed.as_micros() as u64, // Use microseconds for filter
                None,
            );

            continue; // Silent skip for non-suspicious logs
        }

        // LLM analysis
        info!("🔍 [ANALYZE] {}", &line[..line.len().min(50)]);

        match llm_client.analyze(&line).await {
            Ok(decision) => {
                let elapsed = start.elapsed();
                let latency_ms = elapsed.as_millis() as u64;
                let mut s = stats.lock().await;
                s.analyzed += 1;
                s.total_latency_ms += latency_ms;

                // Record decision
                let record_id = audit_trail
                    .record(
                        &line,
                        &decision.action,
                        decision.confidence,
                        false,
                        latency_ms,
                        Some(decision.raw_response.clone()),
                    )
                    .unwrap_or(0);

                if decision.action == "KILL" {
                    error!("═══════════════════════════════════════════════════════════════");
                    error!("  🚨 KILL SWITCH ACTIVATED!");
                    error!("═══════════════════════════════════════════════════════════════");
                    error!("  Decision ID: {}", record_id);
                    error!("  Latency: {}ms", latency_ms);
                    error!("  Confidence: {}%", decision.confidence);
                    error!("═══════════════════════════════════════════════════════════════");

                    if let Some(pid) = config.target_pid {
                        kill_process(pid);
                    }

                    s.kills += 1;
                } else {
                    info!("🟢 [SUSTAIN] ID:{} {}ms", record_id, latency_ms);
                }
            }
            Err(e) => {
                let elapsed = start.elapsed();
                warn!("⚠️ LLM error: {} - defaulting to SUSTAIN", e);

                let _ = audit_trail.record(
                    &line,
                    "SUSTAIN",
                    0,
                    false,
                    elapsed.as_millis() as u64,
                    Some(format!("ERROR: {}", e)),
                );
            }
        }
    }
}

#[derive(Default)]
struct Stats {
    filtered: u64,
    analyzed: u64,
    kills: u64,
    total_latency_ms: u64,
}

#[cfg(unix)]
fn kill_process(pid: u32) {
    info!("🔪 Sending SIGKILL to PID {}", pid);
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).spawn();
}

#[cfg(windows)]
fn kill_process(pid: u32) {
    info!("🔪 Terminating PID {}", pid);
    let _ = Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .spawn();
}
