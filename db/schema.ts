import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const trackerState = sqliteTable("tracker_state", {
  id: integer("id").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
