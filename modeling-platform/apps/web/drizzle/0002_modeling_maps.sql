CREATE TABLE "modeling_maps" (
	"analysis_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text,
	"result" jsonb,
	"note" text DEFAULT '' NOT NULL,
	"model" text,
	"precision" integer DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modeling_maps" ADD CONSTRAINT "modeling_maps_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modeling_maps" ADD CONSTRAINT "modeling_maps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modeling_maps_owner_idx" ON "modeling_maps" USING btree ("owner_id","updated_at");