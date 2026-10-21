/*
TypeScript source contract preserved from the supplied ZIP.

Hatchable validates lib/*.ts as runnable source and does not provide the
Drizzle ORM package by default, so this first placeholder intentionally keeps
the original strict schema as documentation until it is translated into
Hatchable migrations/*.sql.

import {
  boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp
} from "drizzle-orm/pg-core";

export const homes = pgTable("homes", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  rentCents: integer("rent_cents").notNull(),
  depositCents: integer("deposit_cents").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: doublePrecision("bathrooms").notNull(),
  sqft: integer("sqft").notNull(),
  propertyType: text("property_type").notNull().default("Single-family home"),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  petsAllowed: boolean("pets_allowed").notNull().default(false),
  availableFrom: text("available_from").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  referenceCode: text("reference_code").notNull().unique(),
  homeId: integer("home_id").notNull().references(() => homes.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  moveInDate: text("move_in_date").notNull(),
  monthlyIncome: integer("monthly_income").notNull().default(0),
  occupants: integer("occupants").notNull().default(1),
  answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
  status: text("status").notNull().default("awaiting_payment"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  stripeSessionId: text("stripe_session_id"),
  feeCents: integer("fee_cents").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  businessName: text("business_name").notNull().default("Nationwide Home Rentals"),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  applicationFeeCents: integer("application_fee_cents").notNull().default(3500),
  applicationMode: text("application_mode").notNull().default("simplified"),
  cashAppTag: text("cash_app_tag").notNull().default(""),
  venmoHandle: text("venmo_handle").notNull().default(""),
  paypalMe: text("paypal_me").notNull().default(""),
  zelleContact: text("zelle_contact").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Home = typeof homes.$inferSelect;
export type NewHome = typeof homes.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type Settings = typeof settings.$inferSelect;
*/