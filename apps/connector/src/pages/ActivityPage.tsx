import { useActivityStore } from "../store/useActivityStore";

export function ActivityPage() {
  const entries = useActivityStore((s) => s.entries);
  const clear = useActivityStore((s) => s.clear);

  const levelText = (level: "info" | "error") => (level === "info" ? "信息" : "错误");

  return (
    <section className="card">
      <div className="card-header">
        <h2>活动</h2>
        <button type="button" className="btn btn-small" onClick={clear}>
          清空
        </button>
      </div>
      <p className="hint">这里展示前端操作与 Tauri 命令执行结果。</p>

      <ul className="list">
        {entries.length === 0 && <li className="list-empty">暂无活动记录。</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="list-row">
            <span className={`pill ${entry.level}`}>{levelText(entry.level)}</span>
            <span>{entry.message}</span>
            <time>{entry.timestamp}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
