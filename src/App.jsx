import { useEffect, useState } from "react";
import "./App.css";

const CONTACT_EMAIL = "hello@hummusapiens.in";

// Preorder phase: no payment is taken. The cart submits a lead (chosen
// items + contact) to the backend so we can gauge demand. The payment
// backend stays in place for when we switch checkout back on.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

const NAV = ["Home", "About", "Products", "Gallery", "Reviews", "Contact"];

const PRODUCTS = [
  {
    name: "The O.G",
    price: 259,
    img: "/img/og.png",
    desc: "Our signature hummus made with organic chickpeas, tahini, and a splash of lemon juice.",
    tags: ["Vegan", "Gluten-Free"],
  },
  {
    name: "The Beetrooter",
    price: 279,
    img: "/img/beet.png",
    desc: "Roasted beets combined with fresh dill for a vibrant, earthy twist on a classic.",
    tags: ["Vegan"],
  },
  {
    name: "Paprika Twist",
    price: 299,
    img: "/img/paprika.png",
    desc: "Roasted red peppers blend harmoniously with our classic, creamy hummus base.",
    tags: ["Vegan"],
  },
  {
    name: "Caramelised Kick",
    price: 299,
    img: "/img/caramel.png",
    desc: "Slow-cooked onions, deep and smoky, blended into creamy chickpeas.",
    tags: ["Vegan", "Gluten-Free", "Chef's Pick"],
  },
  {
    name: "Lemon-Garlic Tahini Dip",
    price: 319,
    img: null,
    desc: "Zesty lemon and roasted garlic dance together in a silky tahini dip.",
    tags: ["Vegan", "Gluten-Free"],
  },
  {
    name: "Jalapeño Punch",
    price: 319,
    img: "/img/jalapeno.png",
    desc: "A zesty, clean heat layered over our signature creamy chickpea base.",
    tags: ["Vegan", "Gluten-Free", "Best Seller"],
  },
  {
    name: "Spicy Harissa Hummus",
    price: 319,
    img: null,
    desc: "Add a kick to your snacking with this bold North-African spiced blend.",
    tags: ["Vegan", "Spicy"],
  },
  {
    name: "Dark Choco Muse",
    price: 329,
    img: "/img/coco.png",
    desc: "Dark cacao folded into the creamiest hummus we make. Not dessert, not a compromise.",
    tags: ["Vegan", "Chef's Pick"],
  },
];

const GALLERY = [
  "/img/og.png",
  "/img/beet.png",
  "/img/paprika.png",
  "/img/jalapeno.png",
  "/img/caramel.png",
  "/img/coco.png",
];

const FEATURES = [
  { t: "100% Plant-Based", d: "Every recipe is fully vegan, by design." },
  { t: "Clean Ingredients", d: "Real food. Zero preservatives, ever." },
  { t: "Gut-Friendly", d: "High in protein and fibre, kind on you." },
  { t: "Crafted in Small Batches", d: "Made with love and the finest ingredients." },
];

const REVIEWS = [
  {
    q: "The O.G is the creamiest hummus I've had — it's a staple in my post-workout meals now.",
    n: "Jessica Martinez",
    r: "Fitness Enthusiast",
  },
  {
    q: "As a home chef, I'm picky. Hummusapiens nails the balance of tahini and lemon perfectly.",
    n: "Michael Harris",
    r: "Home Chef",
  },
  {
    q: "I serve these at every event I cater. Guests always ask where the Beetrooter is from.",
    n: "Sophia Lee",
    r: "Catering Business Owner",
  },
  {
    q: "Genuinely clean ingredients and seriously bold flavour. The Jalapeño Punch is unreal.",
    n: "Aaron Patel",
    r: "Health Blogger",
  },
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [payMsg, setPayMsg] = useState(null);
  const [paying, setPaying] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [stock, setStock] = useState({});
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  useReveal();

  const count = cart.reduce((n, i) => n + i.qty, 0);
  const subtotal = cart.reduce((n, i) => n + i.qty * i.price, 0);
  const emailOk = /^\S+@\S+\.\S+$/.test(customer.email);
  const canPay = customer.name.trim() && emailOk;

  useEffect(() => {
    document.body.style.overflow = cartOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cartOpen]);

  useEffect(() => {
    fetch(`${API_BASE}/api/stock`)
      .then((r) => r.json())
      .then((d) => setStock(d.stock || {}))
      .catch(() => {});
  }, []);

  const stockOf = (name) =>
    stock[name] === undefined ? Infinity : stock[name];

  const addToCart = (p) => {
    const max = stockOf(p.name);
    if (max <= 0) return;
    setCart((c) => {
      const hit = c.find((i) => i.name === p.name);
      if (hit) {
        if (hit.qty >= max) return c;
        return c.map((i) =>
          i.name === p.name ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...c, { name: p.name, price: p.price, img: p.img, qty: 1 }];
    });
    setPlaced(false);
    setPayMsg(null);
    setCartOpen(true);
  };

  const setQty = (name, delta) =>
    setCart((c) =>
      c
        .map((i) =>
          i.name === name
            ? { ...i, qty: Math.min(i.qty + delta, stockOf(name)) }
            : i
        )
        .filter((i) => i.qty > 0)
    );

  const removeItem = (name) =>
    setCart((c) => c.filter((i) => i.name !== name));

  const placePreorder = async () => {
    if (!cart.length) return;
    if (!canPay) {
      setPayMsg("Please enter your name and a valid email to reserve.");
      return;
    }
    setPayMsg(null);
    setPaying(true);
    try {
      const resp = await fetch(`${API_BASE}/api/preorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((i) => ({ name: i.name, qty: i.qty })),
          customer,
        }),
      });
      const out = await resp.json();
      if (!resp.ok || !out.ok) throw new Error(out?.error || "Failed");
      setCart([]);
      setPaying(false);
      setPlaced(true);
    } catch (err) {
      setPaying(false);
      setPayMsg(
        err.message?.includes("valid email")
          ? "Please enter your name and a valid email to reserve."
          : "Couldn't submit your preorder. Please try again in a moment."
      );
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const subject = encodeURIComponent(
      `Website enquiry from ${f.name.value}`
    );
    const body = encodeURIComponent(
      `${f.message.value}\n\n— ${f.name.value} (${f.email.value})`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
    f.reset();
  };

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-inner">
          <a href="#home" className="brand" onClick={() => setNavOpen(false)}>
            <img src="/img/mascot.png" alt="" />
            <span>hummusapiens</span>
          </a>
          <nav className={navOpen ? "links open" : "links"}>
            {NAV.map((l) => (
              <a
                key={l}
                href={`#${l.toLowerCase()}`}
                onClick={() => setNavOpen(false)}
              >
                {l}
              </a>
            ))}
          </nav>
          <div className="nav-right">
            <button
              type="button"
              className="cart"
              aria-label="Open cart"
              onClick={() => setCartOpen(true)}
            >
              Cart<span>{count}</span>
            </button>
            <button
              className="burger"
              aria-label="Menu"
              onClick={() => setNavOpen((o) => !o)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy" data-reveal>
              <span className="pill">Gourmet · Plant-Based · Made with Love</span>
              <h1>
                Artisan Hummus
                <br />
                <em>to Savor</em>
              </h1>
              <p>
                Gourmet, plant-based dips crafted with love and the finest
                ingredients. Perfect for every occasion — from a quiet snack to
                a full spread.
              </p>
              <div className="hero-actions">
                <a href="#products" className="btn btn-primary">
                  Shop Now
                </a>
                <a href="#gallery" className="btn btn-ghost">
                  Explore Recipes
                </a>
              </div>
              <div className="hero-stats">
                <div>
                  <strong>8</strong>
                  <span>Bold flavours</span>
                </div>
                <div>
                  <strong>100%</strong>
                  <span>Plant-based</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Preservatives</span>
                </div>
              </div>
            </div>
            <div className="hero-art" data-reveal>
              <div className="hero-blob" />
              <img src="/img/og.png" alt="Artisan hummus" className="hero-bowl" />
              <img src="/img/mascot.png" alt="" className="hero-mascot" />
            </div>
          </div>
        </section>

        <section className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.t} data-reveal>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </section>

        <section id="about" className="about">
          <div className="about-art" data-reveal>
            <img src="/img/beet.png" alt="Beetroot hummus" />
            <img src="/img/caramel.png" alt="Caramelised hummus" />
          </div>
          <div className="about-copy" data-reveal>
            <span className="kicker">Our Story</span>
            <h2>Real hummus, made the way it should be.</h2>
            <p>
              Hummus wasn't a health trend where our founder grew up — it was
              just life. Ten years in the kitchen later, Hummusapiens is that
              hummus: high in protein, gut-friendly, olive-oil rich, and bold
              enough to earn a place on your table.
            </p>
            <p>
              We craft every batch by hand with clean, plant-based ingredients
              and absolutely no preservatives. Just real food that respects you.
            </p>
            <a href="#products" className="btn btn-primary">
              Discover the Flavours
            </a>
          </div>
        </section>

        <section id="products" className="products">
          <div className="section-head" data-reveal>
            <span className="kicker">Our Lineup</span>
            <h2>Savor Our Artisan Hummus Creations</h2>
            <p>Gourmet plant-based dips, perfect for any occasion.</p>
          </div>
          <div className="product-grid">
            {PRODUCTS.map((p) => {
              const left = stockOf(p.name);
              const soldOut = left <= 0;
              const low = !soldOut && left <= 5;
              const inCart = cart.find((i) => i.name === p.name)?.qty || 0;
              const maxed = left !== Infinity && inCart >= left;
              return (
                <article
                  className={soldOut ? "card sold-out" : "card"}
                  key={p.name}
                  data-reveal
                >
                  <div className="card-media">
                    {p.img ? (
                      <img src={p.img} alt={p.name} />
                    ) : (
                      <div className="card-ph">
                        <img src="/img/mascot.png" alt="" />
                      </div>
                    )}
                    <div className="card-tags">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className={t === "Best Seller" ? "tag hot" : "tag"}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    {soldOut && <span className="sold-badge">Sold out</span>}
                  </div>
                  <div className="card-body">
                    <div className="card-row">
                      <h3>{p.name}</h3>
                      <span className="price">₹{p.price}</span>
                    </div>
                    <p>{p.desc}</p>
                    {low && (
                      <span className="low-stock">Only {left} left</span>
                    )}
                    <button
                      className="btn btn-primary btn-block"
                      onClick={() => addToCart(p)}
                      disabled={soldOut || maxed}
                    >
                      {soldOut
                        ? "Sold out"
                        : maxed
                          ? "Max in cart"
                          : "Add to Cart"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="gallery" className="gallery">
          <div className="section-head" data-reveal>
            <span className="kicker">Gallery</span>
            <h2>Made to be shared.</h2>
          </div>
          <div className="gallery-grid" data-reveal>
            {GALLERY.map((g, i) => (
              <div className={`g-tile g-${i}`} key={g}>
                <img src={g} alt="Hummus serving" />
              </div>
            ))}
          </div>
        </section>

        <section id="reviews" className="reviews">
          <div className="section-head" data-reveal>
            <span className="kicker">Loved by Many</span>
            <h2>What our customers say</h2>
          </div>
          <div className="review-grid">
            {REVIEWS.map((rv) => (
              <figure className="review" key={rv.n} data-reveal>
                <div className="stars">★★★★★</div>
                <blockquote>“{rv.q}”</blockquote>
                <figcaption>
                  <strong>{rv.n}</strong>
                  <span>{rv.r}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="contact" className="contact">
          <div className="contact-inner">
            <div className="contact-copy" data-reveal>
              <span className="kicker">Contact</span>
              <h2>Get in Touch for Your Artisan Hummus Needs</h2>
              <p>
                Whether you want to order gourmet dips, need recipe inspiration,
                or want to chat about catering options, we're here to help.
              </p>
              <a href="mailto:hello@hummusapiens.in" className="contact-mail">
                hello@hummusapiens.in
              </a>
            </div>
            <form className="contact-form" data-reveal onSubmit={onSubmit}>
              {sent && (
                <p className="form-ok">
                  Thanks! We'll be in touch shortly. 🌿
                </p>
              )}
              <label>
                Name
                <input type="text" name="name" required placeholder="Your name" />
              </label>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@email.com"
                />
              </label>
              <label>
                Message
                <textarea
                  name="message"
                  rows="4"
                  required
                  placeholder="How can we help?"
                />
              </label>
              <button type="submit" className="btn btn-primary btn-block">
                Send Message
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="#home" className="brand">
              <img src="/img/mascot.png" alt="" />
              <span>hummusapiens</span>
            </a>
            <p>Gourmet plant-based dips crafted with love.</p>
          </div>
          <nav className="footer-nav">
            {NAV.map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`}>
                {l}
              </a>
            ))}
          </nav>
          <div className="footer-social">
            <a href="https://instagram.com/_hummusapiens_" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href="#home">Facebook</a>
            <a href="#home">LinkedIn</a>
          </div>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} Hummusapiens. All rights reserved.</span>
          <span>
            <a href="/privacy.html">Privacy Policy</a> · {CONTACT_EMAIL}
          </span>
        </div>
      </footer>

      <div
        className={cartOpen ? "drawer-overlay open" : "drawer-overlay"}
        onClick={() => setCartOpen(false)}
      />
      <aside
        className={cartOpen ? "drawer open" : "drawer"}
        aria-label="Shopping cart"
      >
        <div className="drawer-head">
          <h3>Your Cart{count > 0 && ` (${count})`}</h3>
          <button
            className="drawer-x"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          >
            ✕
          </button>
        </div>

        {placed ? (
          <div className="drawer-empty">
            <img src="/img/mascot.png" alt="" />
            <h4>You're on the list! 🎉</h4>
            <p>
              Preorder reserved — no payment taken. Your spot is saved and
              we'll be in touch when it's ready.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setPlaced(false);
                setCartOpen(false);
              }}
            >
              Done
            </button>
          </div>
        ) : cart.length === 0 ? (
          <div className="drawer-empty">
            <img src="/img/mascot.png" alt="" />
            <p>Your cart is empty.</p>
            <button
              className="btn btn-primary"
              onClick={() => setCartOpen(false)}
            >
              Browse the flavours
            </button>
          </div>
        ) : (
          <>
            <div className="drawer-items">
              {cart.map((i) => (
                <div className="d-item" key={i.name}>
                  <div className="d-thumb">
                    <img src={i.img || "/img/mascot.png"} alt={i.name} />
                  </div>
                  <div className="d-info">
                    <div className="d-row">
                      <strong>{i.name}</strong>
                      <button
                        className="d-remove"
                        aria-label={`Remove ${i.name}`}
                        onClick={() => removeItem(i.name)}
                      >
                        ✕
                      </button>
                    </div>
                    <span className="d-price">₹{i.price}</span>
                    <div className="stepper">
                      <button
                        aria-label="Decrease quantity"
                        onClick={() => setQty(i.name, -1)}
                      >
                        −
                      </button>
                      <span>{i.qty}</span>
                      <button
                        aria-label="Increase quantity"
                        onClick={() => setQty(i.name, 1)}
                      >
                        +
                      </button>
                      <span className="d-line">₹{i.qty * i.price}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="drawer-foot">
              <div className="d-fields">
                <input
                  type="text"
                  placeholder="Your name"
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer((s) => ({ ...s, name: e.target.value }))
                  }
                />
                <input
                  type="email"
                  placeholder="Email for your receipt"
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer((s) => ({ ...s, email: e.target.value }))
                  }
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer((s) => ({ ...s, phone: e.target.value }))
                  }
                />
              </div>
              <div className="d-subtotal">
                <span>Estimated total</span>
                <strong>₹{subtotal}</strong>
              </div>
              <p className="d-note">
                Preorder now — <strong>no payment taken</strong>. Reserve
                your batch; we'll keep you posted.
              </p>
              {payMsg && <p className="d-warn">{payMsg}</p>}
              <button
                className="btn btn-primary btn-block"
                onClick={placePreorder}
                disabled={paying || !canPay}
              >
                {paying ? "Reserving…" : "Place Preorder"}
              </button>
              <button
                className="btn-link"
                onClick={() => setCartOpen(false)}
              >
                Continue browsing
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
