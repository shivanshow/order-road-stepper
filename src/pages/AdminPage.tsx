import { ArrowLeft, ArrowRight, Check, ExternalLink, RotateCcw } from 'lucide-react';
import { ORDER_STEPS, formatStamp, orderStore, useOrder } from '../demo/orderStore';
import './admin.css';

export function AdminPage() {
  const order = useOrder();
  const last = ORDER_STEPS.length - 1;
  const next = ORDER_STEPS[order.status + 1];
  const current = ORDER_STEPS[order.status];

  return (
    <div className="adm">
      <header className="adm__bar">
        <div className="adm__brand">
          <span className="adm__logo">Q</span>
          <span>QuickCart Admin</span>
        </div>
        <a className="adm__link" href="#/" target="_blank" rel="noreferrer">
          Open buyer view <ExternalLink size={14} />
        </a>
      </header>

      <main className="adm__main">
        <p className="adm__crumb">Orders / #A-10294</p>
        <div className="adm__head">
          <h1>Update order status</h1>
          <span className="adm__live">
            <span className="adm__dot" /> Live on buyer page
          </span>
        </div>

        <section className="adm__card">
          <div className="adm__meta">
            <div>
              <span className="adm__label">Customer</span>
              <span>Alex Rivera</span>
            </div>
            <div>
              <span className="adm__label">Items</span>
              <span>4 · $456.62</span>
            </div>
            <div>
              <span className="adm__label">Current status</span>
              <span className="adm__current">{current?.label}</span>
            </div>
          </div>

          <ol className="adm__steps" aria-label="Order status">
            {ORDER_STEPS.map((s, i) => {
              const done = i < order.status;
              const active = i === order.status;
              return (
                <li key={s.key}>
                  <button
                    className={`adm__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => orderStore.setStatus(i)}
                  >
                    <span className="adm__num">{done || active ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                    <span className="adm__step-label">{s.label}</span>
                    <span className="adm__step-time">{formatStamp(order.timestamps[i]) || 'Not reached'}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="adm__actions">
            <button className="adm__btn adm__btn--ghost" onClick={() => orderStore.reset()}>
              <RotateCcw size={16} /> Reset demo
            </button>
            <div className="adm__actions-main">
              <button className="adm__btn" onClick={() => orderStore.setStatus(order.status - 1)} disabled={order.status === 0}>
                <ArrowLeft size={16} /> Revert
              </button>
              <button
                className="adm__btn adm__btn--primary"
                onClick={() => orderStore.setStatus(order.status + 1)}
                disabled={order.status === last}
              >
                {next ? `Mark as ${next.label.toLowerCase()}` : 'Order completed'} {next && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
