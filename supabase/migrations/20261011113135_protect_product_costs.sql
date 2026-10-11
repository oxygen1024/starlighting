-- Move, rather than discard, costs and cost history out of anonymous Data API / Realtime.
-- The shared password grants a short-lived capability; no employee account is needed.
lock table public.products, public.product_activity_log in access exclusive mode;
create table inventory_private.product_costs(
 product_id uuid primary key references public.products on delete restrict,
 purchase_price numeric(12,2) not null default 0 check(purchase_price>=0)
);
create table inventory_private.cost_history(
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products,
 before_price numeric(12,2), after_price numeric(12,2) not null,
 created_at timestamptz not null default clock_timestamp(), source text not null
);
create index cost_history_product_time on inventory_private.cost_history(product_id,created_at desc,id);
create table inventory_private.cost_access_settings(
 singleton boolean primary key default true check(singleton), password_hash text,
 failures integer not null default 0, retry_at timestamptz not null default now()
);
insert into inventory_private.cost_access_settings(singleton) values(true);
create table inventory_private.cost_sessions(
 token_hash bytea primary key, expires_at timestamptz not null
);
create table public.cost_revision(singleton boolean primary key default true check(singleton),revision bigint not null default 0);
insert into public.cost_revision(singleton) values(true);
alter table public.cost_revision enable row level security;
revoke all on public.cost_revision from public,anon,authenticated;
grant select on public.cost_revision to anon,authenticated;
create policy cost_revision_read on public.cost_revision for select to anon,authenticated using(true);
alter publication supabase_realtime add table public.cost_revision;

alter table inventory_private.product_costs enable row level security;
alter table inventory_private.cost_history enable row level security;
alter table inventory_private.cost_access_settings enable row level security;
alter table inventory_private.cost_sessions enable row level security;
revoke all on inventory_private.product_costs,inventory_private.cost_history,inventory_private.cost_access_settings,inventory_private.cost_sessions from public,anon,authenticated;
revoke all on schema inventory_private from public,anon,authenticated;

insert into inventory_private.product_costs select id,purchase_price from public.products;
insert into inventory_private.cost_history(id,product_id,before_price,after_price,created_at,source)
 select id,product_id,(before_data->>'purchase_price')::numeric,(after_data->>'purchase_price')::numeric,created_at,action
 from public.product_activity_log where after_data ? 'purchase_price';
-- Assert preservation before removing the public copies.
do $$ begin
 if exists(select 1 from public.products p left join inventory_private.product_costs c on c.product_id=p.id where c.purchase_price is distinct from p.purchase_price)
 then raise exception '成本搬移驗證失敗'; end if;
 if (select count(*) from inventory_private.cost_history)<>(select count(*) from public.product_activity_log where after_data ? 'purchase_price')
 then raise exception '成本紀錄搬移驗證失敗'; end if;
end $$;
update public.product_activity_log set before_data=before_data-'purchase_price',after_data=after_data-'purchase_price';
alter table public.products drop column purchase_price;

create function inventory_private.init_product_cost() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into inventory_private.product_costs(product_id) values(new.id);
 insert into inventory_private.cost_history(product_id,after_price,source) values(new.id,0,'created');
 return new;
end $$;
revoke all on function inventory_private.init_product_cost() from public,anon,authenticated;
create trigger init_product_cost after insert on public.products for each row execute function inventory_private.init_product_cost();

create function inventory_private.require_cost_session(p_token text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_token is null or length(p_token)<>64 or not exists(
  select 1 from inventory_private.cost_sessions where token_hash=extensions.digest(p_token,'sha256') and expires_at>clock_timestamp()
 ) then raise exception using errcode='42501',message='成本已鎖定，請重新輸入密碼'; end if;
end $$;
revoke all on function inventory_private.require_cost_session(text) from public,anon,authenticated;

create function public.unlock_product_costs(p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg inventory_private.cost_access_settings%rowtype; token text; expiry timestamptz;
begin
 select * into cfg from inventory_private.cost_access_settings where singleton for update;
 if cfg.password_hash is null then return jsonb_build_object('error','成本密碼尚未設定，請聯絡管理員'); end if;
 if cfg.retry_at>clock_timestamp() and cfg.failures>=8 then return jsonb_build_object('error','嘗試次數過多，請 5 分鐘後再試'); end if;
 if cfg.retry_at<=clock_timestamp() then
  cfg.failures:=0;
  update inventory_private.cost_access_settings set failures=0,retry_at=clock_timestamp()+interval '5 minutes' where singleton;
 end if;
 if p_password is null or octet_length(p_password)>72 or octet_length(p_password)<12 then
  update inventory_private.cost_access_settings set failures=failures+1 where singleton;
  return jsonb_build_object('error','密碼不正確');
 end if;
 if extensions.crypt(p_password,cfg.password_hash)<>cfg.password_hash then
  update inventory_private.cost_access_settings set failures=failures+1 where singleton;
  return jsonb_build_object('error','密碼不正確');
 end if;
 update inventory_private.cost_access_settings set failures=0,retry_at=clock_timestamp() where singleton;
 delete from inventory_private.cost_sessions where expires_at<=clock_timestamp();
 token:=encode(extensions.gen_random_bytes(32),'hex'); expiry:=clock_timestamp()+interval '15 minutes';
 insert into inventory_private.cost_sessions values(extensions.digest(token,'sha256'),expiry);
 return jsonb_build_object('token',token,'expires_at',expiry);
end $$;

create function public.read_product_costs(p_token text,p_offset integer default 0)
returns table(product_id uuid,purchase_price numeric)
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_cost_session(p_token);
 if p_offset is null or p_offset<0 then raise exception '分頁無效'; end if;
 return query select c.product_id,c.purchase_price from inventory_private.product_costs c order by c.product_id limit 1000 offset p_offset;
end $$;
create function public.read_cost_history(p_token text,p_product uuid,p_offset integer default 0)
returns table(id uuid,before_price numeric,after_price numeric,created_at timestamptz,source text)
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_cost_session(p_token);
 if p_offset is null or p_offset<0 then raise exception '分頁無效'; end if;
 return query select h.id,h.before_price,h.after_price,h.created_at,h.source from inventory_private.cost_history h where h.product_id=p_product order by h.created_at desc,h.id limit 50 offset p_offset;
end $$;
create function public.update_product_cost(p_token text,p_product uuid,p_price numeric,p_expected numeric) returns void
language plpgsql security definer set search_path='' as $$
declare previous numeric;
begin
 perform inventory_private.require_cost_session(p_token);
 if p_price is null or p_price<0 or p_price>9999999999.99 or p_price<>round(p_price,2) then raise exception '入貨單價須為非負數，最多兩位小數'; end if;
 perform 1 from public.products where id=p_product and archived_at is null for update;
 if not found then raise exception '貨品不存在或已刪除'; end if;
 select purchase_price into previous from inventory_private.product_costs where product_id=p_product for update;
 if previous is distinct from p_expected then raise exception '入貨單價已被其他裝置更改，請重新整理後再試'; end if;
 if previous is not distinct from p_price then return; end if;
 update inventory_private.product_costs set purchase_price=p_price where product_id=p_product;
 insert into inventory_private.cost_history(product_id,before_price,after_price,source) values(p_product,previous,p_price,'updated');
 update public.cost_revision set revision=revision+1 where singleton;
end $$;
create function public.lock_product_costs(p_token text) returns void
language plpgsql security definer set search_path='' as $$
begin delete from inventory_private.cost_sessions where token_hash=extensions.digest(p_token,'sha256'); end $$;
create function public.change_cost_password(p_token text,p_password text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from inventory_private.cost_access_settings where singleton for update;
 perform inventory_private.require_cost_session(p_token);
 if p_password is null or length(p_password)<12 or octet_length(p_password)>72 then raise exception '密碼最少 12 個字元，最多 72 位元組'; end if;
 update inventory_private.cost_access_settings set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),failures=0,retry_at=clock_timestamp() where singleton;
 delete from inventory_private.cost_sessions;
 update public.cost_revision set revision=revision+1 where singleton;
end $$;

revoke all on function public.unlock_product_costs(text),public.read_product_costs(text,integer),public.read_cost_history(text,uuid,integer),public.update_product_cost(text,uuid,numeric,numeric),public.lock_product_costs(text),public.change_cost_password(text,text) from public,anon,authenticated;
grant execute on function public.unlock_product_costs(text),public.read_product_costs(text,integer),public.read_cost_history(text,uuid,integer),public.update_product_cost(text,uuid,numeric,numeric),public.lock_product_costs(text),public.change_cost_password(text,text) to anon,authenticated;
notify pgrst,'reload schema';
