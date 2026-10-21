import { db } from "hatchable";
export const access = "public";
export const methods = ["POST"];

const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const checked = v => v === "on" || v === true;

export default async function (req, res) {
  const b = req.body || {};
  const homeId = Number(b.homeId);
  const fullName = clean(b.fullName, 120);
  const email = clean(b.email, 180).toLowerCase();
  const phone = clean(b.phone, 50);
  const moveInDate = clean(b.moveInDate, 20);
  const signature = clean(b.signature, 200);
  const incomeInput = b.monthlyIncome === "" || b.monthlyIncome == null ? 0 : Number(b.monthlyIncome);
  const occupants = b.occupants === "" || b.occupants == null ? 1 : Number(b.occupants);

  if (!Number.isInteger(homeId) || homeId <= 0 || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !phone || !/^\d{4}-\d{2}-\d{2}$/.test(moveInDate) || Number.isNaN(Date.parse(moveInDate)) ||
      !signature || !checked(b.consentScreening) || !checked(b.consentPolicy)) {
    return res.status(400).json({ ok: false, message: "Complete the required contact fields, move-in date, typed signature, and both consent checkboxes." });
  }
  if (!Number.isFinite(incomeInput) || incomeInput < 0 || incomeInput > 10000000 ||
      !Number.isInteger(occupants) || occupants < 1 || occupants > 20) {
    return res.status(400).json({ ok: false, message: "Enter a valid monthly income and an occupant count between 1 and 20." });
  }

  const { rows: homes } = await db.query(
    "SELECT id, slug, is_available, listing_status, owner_authorized FROM homes WHERE id = $1",
    [homeId]
  );
  if (!homes[0] || !homes[0].is_available || homes[0].listing_status !== "available" || !homes[0].owner_authorized) {
    return res.status(409).json({ ok: false, message: "This home is not accepting applications right now. Please choose another listing or check back later." });
  }

  const { rows: settings } = await db.query("SELECT application_fee_cents FROM settings WHERE id = 1");
  const fee = Number(settings[0]?.application_fee_cents ?? 3500);
  const ref = "RA-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 9).toUpperCase();
  const answers = {
    signature,
    pets: clean(b.pets, 80),
    rentalHistory: clean(b.rentalHistory, 1000),
    employment: clean(b.employment, 1000),
    consentScreening: checked(b.consentScreening),
    consentPolicy: checked(b.consentPolicy)
  };

  await db.query(
    "INSERT INTO applications (reference_code,home_id,full_name,email,phone,move_in_date,monthly_income,occupants,answers,fee_cents,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'under_review')",
    [ref, homeId, fullName, email, phone, moveInDate, Math.round(incomeInput), occupants, JSON.stringify(answers), fee]
  );

  return res.status(201).json({ ok: true, referenceCode: ref, feeCents: fee, paymentCollected: false });
}