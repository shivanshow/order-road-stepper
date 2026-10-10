import {
  Check,
  CircleCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  RotateCcw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Truck,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { OrderRoadStepper } from '../components/OrderRoadStepper';
import { ORDER_STEPS, estimatedDelivery, formatStamp, useOrder } from '../demo/orderStore';
import './buyer.css';

const ITEMS = [
  {
    id: 'hp-01',
    name: 'Aurora ANC Wireless Over-Ear Headphones',
    variant: 'Color: Matte Black',
    seller: 'Northwind Audio',
    qty: 1,
    price: 149,
    image: '/products/headphones.jpg',
  },
  {
    id: 'sw-42',
    name: 'Pulse 2 Smartwatch, 42 mm',
    variant: 'Band: Cloud White Silicone',
    seller: 'QuickCart',
    qty: 1,
    price: 199,
    image: '/products/watch.jpg',
  },
  {
    id: 'sg-09',
    name: 'Wayline Classic Polarized Sunglasses',
    variant: 'Frame: Black · Lens: Grey',
    seller: 'Sol & Co.',
    qty: 2,
    price: 59,
    image: '/products/sunglasses.jpg',
  },
];

const STATUS_PILL: Record<string, { label: string; tone: string }> = {
  placed: { label: 'Order placed', tone: 'slate' },
  confirmed: { label: 'Confirmed', tone: 'indigo' },
  shipped: { label: 'Shipped', tone: 'blue' },
  out: { label: 'Out for delivery', tone: 'amber' },
  delivered: { label: 'Delivered', tone: 'green' },
};

const ACTIVITY: Record<string, { title: string; detail: string }> = {
  placed: { title: 'Order placed', detail: 'Payment of $456.62 authorized on Visa ending in 4242' },
  confirmed: { title: 'Order confirmed', detail: 'Sellers accepted your order and are preparing it' },
  shipped: { title: 'Shipped', detail: 'Departed QuickCart fulfillment center · Edison, NJ' },
  out: { title: 'Out for delivery', detail: 'With courier at Brooklyn delivery station' },
  delivered: { title: 'Delivered', detail: 'Left at front door · Signed by A. Rivera' },
};

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="by-thumb by-thumb--empty" aria-label={alt}>
        <Package size={24} />
      </div>
    );
  }
  return <img className="by-thumb" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function BuyerPage() {
  const order = useOrder();
  const [copied, setCopied] = useState(false);
  const stepKey = ORDER_STEPS[order.status]?.key ?? 'placed';
  const pill = STATUS_PILL[stepKey];
  const delivered = stepKey === 'delivered';

  // The road is only for orders in progress. If the page opens on a delivered order it is never shown;
  // if delivery happens while watching, the truck finishes its trip and then the road folds away.
  const [roadPhase, setRoadPhase] = useState<'shown' | 'collapsing' | 'hidden'>(delivered ? 'hidden' : 'shown');
  const timers = useRef<number[]>([]);
  if (!delivered && roadPhase !== 'shown') setRoadPhase('shown');
  useEffect(() => {
    if (delivered) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, [delivered]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const handleArrive = (index: number) => {
    if (index !== ORDER_STEPS.length - 1) return;
    timers.current.push(
      window.setTimeout(() => setRoadPhase('collapsing'), 2200),
      window.setTimeout(() => setRoadPhase('hidden'), 2900),
    );
  };
  const eta = useMemo(() => estimatedDelivery(order), [order]);

  const steps = useMemo(
    () =>
      ORDER_STEPS.map((s, i) => ({
        ...s,
        description: order.timestamps[i]
          ? formatStamp(order.timestamps[i])
          : s.key === 'delivered'
            ? `Expected ${formatStamp(eta.toISOString(), false)}`
            : undefined,
      })),
    [order.timestamps, eta],
  );

  const activity = ORDER_STEPS.map((s, i) => ({ key: s.key, at: order.timestamps[i], ...ACTIVITY[s.key] }))
    .filter((a) => a.at)
    .reverse();

  const subtotal = ITEMS.reduce((sum, it) => sum + it.qty * it.price, 0);
  const discount = Math.round(subtotal * 0.1 * 100) / 100;
  const tax = Math.round((subtotal - discount) * 0.08875 * 100) / 100;
  const total = subtotal - discount + tax;
  const itemCount = ITEMS.reduce((n, it) => n + it.qty, 0);

  const copyTracking = async () => {
    try {
      await navigator.clipboard.writeText('1Z999AA10123456784');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; nothing to do
    }
  };

  const etaText = eta.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const headline = delivered
    ? `Delivered ${new Date(order.timestamps[4] ?? eta).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
    : stepKey === 'out'
      ? 'Arriving today by 8 PM'
      : `Arriving ${etaText}`;

  return (
    <div className="by">
      <header className="by-nav">
        <div className="by-nav__inner">
          <a className="by-logo" href="#/">
            <ShoppingBag size={22} strokeWidth={2.2} />
            QuickCart
          </a>
          <label className="by-search">
            <Search size={17} />
            <input type="search" placeholder="Search products, brands and more" />
          </label>
          <nav className="by-nav__icons" aria-label="Account">
            <a href="#/" aria-label="Wishlist"><Heart size={20} /></a>
            <a href="#/" aria-label="Cart" className="by-cart">
              <ShoppingCart size={20} />
              <span className="by-cart__badge">2</span>
            </a>
            <a href="#/" className="by-account">
              <User size={20} />
              <span>Hi, Alex</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="by-main">
        <nav className="by-crumbs" aria-label="Breadcrumb">
          <a href="#/">Home</a>
          <ChevronRight size={14} />
          <a href="#/">Your orders</a>
          <ChevronRight size={14} />
          <span aria-current="page">#A-10294</span>
        </nav>

        <div className="by-title">
          <div>
            <div className="by-title__row">
              <h1>Order #A-10294</h1>
              <span className={`by-pill by-pill--${pill.tone}`}>{pill.label}</span>
            </div>
            <p className="by-muted">
              Placed on {formatStamp(order.timestamps[0], false)}, 2026 · {itemCount} items · {money(total)}
            </p>
          </div>
          <div className="by-title__actions">
            <button className="by-btn"><Download size={16} /> Invoice</button>
            <button className="by-btn"><CircleHelp size={16} /> Get help</button>
          </div>
        </div>

        <section className="by-card by-track">
          <div className="by-track__head">
            <div>
              <h2 className={delivered ? 'is-done' : ''}>{headline}</h2>
              <p className="by-muted">
                {delivered ? 'Your package was delivered to Brooklyn, NY 11201' : 'Shipping to Alex Rivera, Brooklyn, NY 11201'}
              </p>
            </div>
            <div className="by-carrier">
              <Truck size={18} />
              <div>
                <span className="by-carrier__name">UPS Ground</span>
                <span className="by-carrier__no">
                  1Z 999 AA1 0123 4567 84
                  <button onClick={copyTracking} aria-label="Copy tracking number">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </span>
              </div>
            </div>
          </div>
          {roadPhase !== 'hidden' ? (
            <div className={`by-road${roadPhase === 'collapsing' ? ' is-collapsing' : ''}`}>
              <div className="by-road__inner">
                <OrderRoadStepper
                  steps={steps}
                  current={order.status}
                  height={380}
                  truckLabel="QuickCart"
                  ariaLabel="Shipment progress"
                  onArrive={handleArrive}
                />
              </div>
            </div>
          ) : (
            <div className="by-delivered">
              <CircleCheck size={22} />
              <div>
                <p><strong>Package delivered</strong></p>
                <p className="by-muted">
                  {formatStamp(order.timestamps[ORDER_STEPS.length - 1])} · Left at front door · Signed by A. Rivera
                </p>
              </div>
              <button className="by-btn by-btn--sm">View proof of delivery</button>
            </div>
          )}
        </section>

        <div className="by-grid">
          <div className="by-col">
            <section className="by-card">
              <h3 className="by-card__title">Items in this order</h3>
              <ul className="by-items">
                {ITEMS.map((it) => (
                  <li key={it.id} className="by-item">
                    <ProductImage src={it.image} alt={it.name} />
                    <div className="by-item__body">
                      <a href="#/" className="by-item__name">{it.name}</a>
                      <p className="by-muted">{it.variant}</p>
                      <p className="by-muted">Sold by {it.seller} · Qty {it.qty}</p>
                      <div className="by-item__actions">
                        <button className="by-btn by-btn--sm"><RotateCcw size={14} /> Buy it again</button>
                        {delivered ? (
                          <>
                            <button className="by-btn by-btn--sm"><Star size={14} /> Write a review</button>
                            <button className="by-btn by-btn--sm by-btn--link">Return or replace</button>
                          </>
                        ) : (
                          <button className="by-btn by-btn--sm by-btn--link" disabled={order.status >= 2}>
                            {order.status >= 2 ? 'Cannot cancel after shipping' : 'Cancel item'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="by-item__price">
                      {money(it.price * it.qty)}
                      {it.qty > 1 && <span className="by-muted">{money(it.price)} each</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="by-card">
              <h3 className="by-card__title">Shipment activity</h3>
              <ol className="by-activity">
                {activity.map((a, i) => (
                  <li key={a.key} className={i === 0 ? 'is-latest' : ''}>
                    <span className="by-activity__dot" />
                    <div>
                      <p className="by-activity__title">{a.title}</p>
                      <p className="by-muted">{a.detail}</p>
                    </div>
                    <time className="by-muted" dateTime={a.at ?? undefined}>{formatStamp(a.at)}</time>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="by-col">
            <section className="by-card">
              <h3 className="by-card__title">Order summary</h3>
              <dl className="by-sum">
                <div><dt>Items ({itemCount})</dt><dd>{money(subtotal)}</dd></div>
                <div><dt>Shipping</dt><dd className="by-green">Free</dd></div>
                <div>
                  <dt>Discount <span className="by-code">SUMMER10</span></dt>
                  <dd className="by-green">−{money(discount)}</dd>
                </div>
                <div><dt>Estimated tax</dt><dd>{money(tax)}</dd></div>
                <div className="by-sum__total"><dt>Total</dt><dd>{money(total)}</dd></div>
              </dl>
            </section>

            <section className="by-card">
              <h3 className="by-card__title">Payment</h3>
              <div className="by-pay">
                <span className="by-visa">VISA</span>
                <div>
                  <p>Visa ending in 4242</p>
                  <p className="by-muted">Expires 08/28</p>
                </div>
                <span className="by-pill by-pill--green">Paid</span>
              </div>
              <p className="by-muted by-small">Billing address same as shipping</p>
            </section>

            <section className="by-card">
              <h3 className="by-card__title">Shipping address</h3>
              <div className="by-addr">
                <MapPin size={18} />
                <address>
                  <strong>Alex Rivera</strong>
                  <br />
                  214 Atlantic Ave, Apt 3B
                  <br />
                  Brooklyn, NY 11201
                  <br />
                  United States
                  <br />
                  <span className="by-muted">+1 (718) 555-0142</span>
                </address>
              </div>
              <p className="by-note">
                <strong>Delivery instructions:</strong> Leave with the doorman if no one answers.
              </p>
            </section>

            <section className="by-card by-help">
              <MessageCircle size={20} />
              <div>
                <p><strong>Need help with this order?</strong></p>
                <p className="by-muted">Our support team replies in about 5 minutes.</p>
                <a href="#/">Contact support</a>
              </div>
            </section>
          </aside>
        </div>
      </main>

      <footer className="by-foot">
        <div className="by-foot__inner">
          <span>© 2026 QuickCart, Inc.</span>
          <nav>
            <a href="#/">Help center</a>
            <a href="#/">Returns</a>
            <a href="#/">Privacy</a>
            <a href="#/">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
