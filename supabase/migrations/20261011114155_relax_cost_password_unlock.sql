-- User-requested shared PIN and manual locking; existing passwords remain valid.
alter table inventory_private.cost_sessions alter column expires_at drop not null;
delete from inventory_private.cost_sessions where expires_at<=clock_timestamp();
update inventory_private.cost_sessions set expires_at=null;

create or replace function inventory_private.require_cost_session(p_token text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_token is null or length(p_token)<>64 or not exists(
  select 1 from inventory_private.cost_sessions where token_hash=extensions.digest(p_token,'sha256') and (expires_at is null or expires_at>clock_timestamp())
 ) then raise exception using errcode='42501',message='成本已鎖定，請重新輸入密碼'; end if;
end $$;

create or replace function public.unlock_product_costs(p_password text) returns jsonb
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
 if p_password is null or octet_length(p_password)>72 or length(p_password)<4 then
  update inventory_private.cost_access_settings set failures=failures+1 where singleton;
  return jsonb_build_object('error','密碼不正確');
 end if;
 if extensions.crypt(p_password,cfg.password_hash)<>cfg.password_hash then
  update inventory_private.cost_access_settings set failures=failures+1 where singleton;
  return jsonb_build_object('error','密碼不正確');
 end if;
 update inventory_private.cost_access_settings set failures=0,retry_at=clock_timestamp() where singleton;
 delete from inventory_private.cost_sessions where expires_at<=clock_timestamp();
 token:=encode(extensions.gen_random_bytes(32),'hex'); expiry:=null;
 insert into inventory_private.cost_sessions values(extensions.digest(token,'sha256'),expiry);
 return jsonb_build_object('token',token,'expires_at',expiry);
end $$;

create or replace function public.change_cost_password(p_token text,p_password text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from inventory_private.cost_access_settings where singleton for update;
 perform inventory_private.require_cost_session(p_token);
 if p_password is null or length(p_password)<4 or octet_length(p_password)>72 then raise exception '密碼最少 4 個字元（可用四位數字），最多 72 位元組'; end if;
 update inventory_private.cost_access_settings set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),failures=0,retry_at=clock_timestamp() where singleton;
 delete from inventory_private.cost_sessions;
 update public.cost_revision set revision=revision+1 where singleton;
end $$;
notify pgrst,'reload schema';
