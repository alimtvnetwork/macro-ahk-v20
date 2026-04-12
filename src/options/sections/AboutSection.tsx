/**
 * Marco Extension — React Options: About Section
 */

// eslint-disable-next-line max-lines-per-function
export function AboutSection() {
    const version = "2.20.0"; // Resolved from manifest in extension context

    return (
        <>
            <div className="content-header">
                <h1 className="content-title">About</h1>
            </div>

            <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Marco Extension</div>
                <div className="card-meta">Version: {version}</div>
                <div className="card-meta" style={{ marginTop: 4 }}>
                    Browser automation for workspace and credit management
                </div>
                <div className="card-meta" style={{ marginTop: 12 }}>
                    Browser automation for workspace and credit management.
                    Automatically injects scripts based on URL rules and project configuration.
                </div>
            </div>

            <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Author</div>
                <div className="card-meta" style={{ fontWeight: 600 }}>
                    <a href="https://www.google.com/search?q=alim+ul+karim" target="_blank" rel="noopener noreferrer">Md. Alim Ul Karim</a>
                </div>
                <div className="card-meta" style={{ marginTop: 4 }}>
                    <a href="https://alimkarim.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>Creator & Lead Architect</a>
                    {" | "}
                    <a href="https://www.google.com/search?q=alim+ul+karim" target="_blank" rel="noopener noreferrer">Chief Software Engineer</a>
                    {", "}
                    <a href="https://riseup-asia.com" target="_blank" rel="noopener noreferrer">Riseup Asia LLC</a>
                </div>
                <div className="card-meta" style={{ marginTop: 4 }}>
                    <a href="https://riseup-asia.com" target="_blank" rel="noopener noreferrer">Top Leading Software Company in WY (2026)</a>
                </div>
                <div className="card-meta" style={{ marginTop: 4 }}>
                    20+ years of programming experience
                </div>
                <div className="card-meta" style={{ marginTop: 8 }}>
                    Known for inventing an automatic unit test generation tool before AI in 2018 — capable of writing code and unit tests automatically.
                </div>
                <div className="card-meta" style={{ marginTop: 4 }}>
                    Created to help developers automate repetitive browser tasks more effectively.
                </div>
                <div className="card-meta" style={{ marginTop: 8 }}>
                    <a href="https://alimkarim.com" target="_blank" rel="noopener noreferrer">alimkarim.com</a>
                    {" • "}
                    <a href="https://riseup-asia.com" target="_blank" rel="noopener noreferrer">riseup-asia.com</a>
                    {" • "}
                    <a href="https://www.linkedin.com/in/alaboratory/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                </div>
            </div>

            <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Architecture</div>
                <div className="card-meta">
                    • SQLite (sql.js) for structured logging<br />
                    • OPFS-first persistence with chrome.storage.local fallback<br />
                    • Programmatic script injection via chrome.scripting<br />
                    • Cookie-based authentication for API access<br />
                    • 50+ message types for cross-layer communication
                </div>
            </div>
        </>
    );
}
