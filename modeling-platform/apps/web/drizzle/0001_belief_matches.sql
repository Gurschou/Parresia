CREATE TABLE "belief_match_runs" (
	"analysis_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text,
	"summary" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"person_count" integer DEFAULT 0 NOT NULL,
	"model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "belief_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"run_analysis_id" text NOT NULL,
	"from_analysis_id" text NOT NULL,
	"to_analysis_id" text NOT NULL,
	"kind" text NOT NULL,
	"fit" integer NOT NULL,
	"belief_kind" text NOT NULL,
	"belief_type" text NOT NULL,
	"statement" text NOT NULL,
	"impact" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"anchor_type" text DEFAULT 'none' NOT NULL,
	"anchor_text" text DEFAULT '' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"bridge_question" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experts" ADD COLUMN "is_self" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "belief_match_runs" ADD CONSTRAINT "belief_match_runs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_match_runs" ADD CONSTRAINT "belief_match_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_matches" ADD CONSTRAINT "belief_matches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_matches" ADD CONSTRAINT "belief_matches_run_analysis_id_analyses_id_fk" FOREIGN KEY ("run_analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_matches" ADD CONSTRAINT "belief_matches_from_analysis_id_analyses_id_fk" FOREIGN KEY ("from_analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_matches" ADD CONSTRAINT "belief_matches_to_analysis_id_analyses_id_fk" FOREIGN KEY ("to_analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "belief_matches_owner_idx" ON "belief_matches" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "belief_matches_run_idx" ON "belief_matches" USING btree ("run_analysis_id");--> statement-breakpoint
CREATE INDEX "belief_matches_from_idx" ON "belief_matches" USING btree ("from_analysis_id");--> statement-breakpoint
CREATE INDEX "belief_matches_to_idx" ON "belief_matches" USING btree ("to_analysis_id");