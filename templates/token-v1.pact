(module {{MODULE}} GOVERNANCE

  @doc "{{NAME}} ({{SYMBOL}}) - created with TokenGo by Kadena Nexus"

  (implements fungible-v2)
  (implements fungible-xchain-v1)

  (use free.util-fungible)
  (use free.util-chain-data)

  ;---------------------------------------------------------------------------
  ; Governance
  ;---------------------------------------------------------------------------
  ; Immutable: no key, including the creator's, can ever upgrade this module
  ; or write to its tables outside its own functions. The creator's keyset is
  ; used only for the one-time init / init-supply on each chain.
  (defcap GOVERNANCE ()
    @doc "TokenGo tokens can never be upgraded"
    (enforce false "TokenGo tokens cannot be upgraded"))

  (defcap INIT ()
    @doc "One-time initialization by the creator"
    (enforce-keyset "{{NAMESPACE}}.gov"))

  ;---------------------------------------------------------------------------
  ; Constants
  ;---------------------------------------------------------------------------
  (defconst MINIMUM_PRECISION:integer 12)

  (defconst TOTAL-SUPPLY:decimal {{SUPPLY}})

  ; Chain where the supply is minted
  (defconst SUPPLY-CHAIN:string {{SUPPLY_CHAIN}})

  ; Chains this module is deployed on (cross-chain transfers are limited to these)
  (defconst DEPLOYED-CHAINS:[string] {{DEPLOYED_CHAINS}})

  (defconst DETAILS
    { "symbol": "{{SYMBOL}}"
    , "name": "{{NAME}}"
    , "description": "{{DESCRIPTION}}"
    , "img": "{{IMAGE_URL}}"
    , "logo": "{{IMAGE_URL}}"
    , "socials": {{SOCIALS}}
    , "supply": TOTAL-SUPPLY
    , "finalized": true
    , "supply-chain": SUPPLY-CHAIN
    , "generator": "tokengo.kadena.ws" })

  ;---------------------------------------------------------------------------
  ; Schemas and tables
  ;---------------------------------------------------------------------------
  (defschema account-schema
    balance:decimal
    guard:guard)

  (deftable accounts-table:{account-schema})

  (defschema init-schema
    init:bool)

  ; Singleton, key ""
  (deftable init-table:{init-schema})

  (defschema allocation
    @doc "One recipient of the initial supply"
    account:string
    guard:guard
    amount:decimal)

  (defschema launch-allocation
    @doc "Public record of the initial supply, written once by init-supply"
    account:string
    amount:decimal)

  ; Key: the receiving account
  (deftable launch-table:{launch-allocation})

  ;---------------------------------------------------------------------------
  ; Capabilities
  ;---------------------------------------------------------------------------
  (defcap DEBIT (sender:string)
    "Capability for managing debiting operations"
    (enforce (!= sender "") "Invalid sender")
    (with-read accounts-table sender {"guard":=g}
      (enforce-guard g)))

  (defcap CREDIT (receiver:string)
    "Capability for managing crediting operations"
    (enforce (!= receiver "") "Invalid receiver"))

  (defcap ROTATE (account:string)
    "Autonomously managed capability for guard rotation"
    @managed
    true)

  (defcap TRANSFER:bool (sender:string receiver:string amount:decimal)
    "Capability for allowing transfers"
    @managed amount TRANSFER-mgr
    (enforce-valid-transfer sender receiver (precision) amount)
    (compose-capability (DEBIT sender))
    (compose-capability (CREDIT receiver)))

  (defun TRANSFER-mgr:decimal (managed:decimal requested:decimal)
    (let ((newbal (- managed requested)))
      (enforce (>= newbal 0.0)
        (format "TRANSFER exceeded for balance {}" [managed]))
      newbal))

  (defcap TRANSFER_XCHAIN:bool (sender:string receiver:string amount:decimal target-chain:string)
    "Capability for allowing cross-chain transfers"
    @managed amount TRANSFER_XCHAIN-mgr
    (enforce-valid-transfer-xchain sender receiver (precision) amount)
    (compose-capability (DEBIT sender)))

  (defun TRANSFER_XCHAIN-mgr:decimal (managed:decimal requested:decimal)
    (enforce (>= managed requested)
      (format "TRANSFER_XCHAIN exceeded for balance {}" [managed]))
    0.0)

  (defcap TRANSFER_XCHAIN_RECD:bool (sender:string receiver:string amount:decimal source-chain:string)
    @event
    true)

  ;---------------------------------------------------------------------------
  ; Utility functions
  ;---------------------------------------------------------------------------
  (defun is-supply-chain:bool ()
    (= SUPPLY-CHAIN (chain-id)))

  (defun is-initialized:bool ()
    (with-default-read init-table "" {"init":false} {"init":=init}
      init))

  (defun enforce-not-initialized:bool ()
    (enforce (not (is-initialized)) "Already initialized"))

  (defun is-finalized:bool ()
    @doc "Always true: TokenGo tokens can never be upgraded"
    true)

  (defun get-launch-allocations:[object{launch-allocation}] ()
    @doc "Who received the supply at launch, and how much (local-only read)"
    (select launch-table (constantly true)))

  (defun is-deployed-chain:bool (chain:string)
    (contains chain DEPLOYED-CHAINS))

  (defun enforce-is-deployed-chain:bool (chain:string)
    (enforce (is-deployed-chain chain) (format "Token is not deployed on chain {}" [chain])))

  (defun general-info:object ()
    DETAILS)

  (defun total-supply:decimal ()
    TOTAL-SUPPLY)

  ;---------------------------------------------------------------------------
  ; fungible-v2 standard functions
  ;---------------------------------------------------------------------------
  (defun enforce-unit:bool (amount:decimal)
    (enforce-precision (precision) amount))

  (defun create-account:string (account:string guard:guard)
    (enforce-valid-account account)
    (enforce-reserved account guard)
    (insert accounts-table account
      {"balance": 0.0,
       "guard": guard})
    (format "Account {} created" [account]))

  (defun get-balance:decimal (account:string)
    (with-read accounts-table account {"balance":= balance}
      balance))

  (defun details:object{fungible-v2.account-details} (account:string)
    (with-read accounts-table account {"balance":= bal, "guard":= g}
      {"account": account,
       "balance": bal,
       "guard": g}))

  (defun rotate:string (account:string new-guard:guard)
    (enforce-reserved account new-guard)
    (with-capability (ROTATE account)
      (with-read accounts-table account {"guard":=old-guard}
        (enforce-guard old-guard))
      (update accounts-table account {"guard": new-guard})))

  (defun precision:integer ()
    MINIMUM_PRECISION)

  ;---------------------------------------------------------------------------
  ; Transfer functions
  ;---------------------------------------------------------------------------
  (defun transfer:string (sender:string receiver:string amount:decimal)
    (enforce-valid-transfer sender receiver MINIMUM_PRECISION amount)
    (with-capability (TRANSFER sender receiver amount)
      (debit sender amount)
      (with-read accounts-table receiver {"guard" := g}
        (credit receiver g amount))))

  (defun transfer-create:string (sender:string receiver:string receiver-guard:guard amount:decimal)
    (enforce-valid-transfer sender receiver MINIMUM_PRECISION amount)
    (with-capability (TRANSFER sender receiver amount)
      (debit sender amount)
      (credit receiver receiver-guard amount)))

  (defun debit:string (account:string amount:decimal)
    (require-capability (DEBIT account))
    (with-read accounts-table account {"balance":= balance}
      (enforce (<= amount balance) "Insufficient funds")
      (update accounts-table account {"balance": (- balance amount)})))

  (defun credit:string (account:string guard:guard amount:decimal)
    (require-capability (CREDIT account))
    (with-default-read accounts-table account
      {"balance":-1.0, "guard": guard}
      {"balance":= balance, "guard":= retg}
      ; never overwrite an existing guard with the caller-supplied one
      (enforce (= retg guard) "Account guards do not match")
      (let ((is-new (if (= balance -1.0)
                        (enforce-reserved account guard)
                        false)))
        (write accounts-table account
          {"balance": (if is-new amount (+ balance amount)),
           "guard": retg}))))

  (defpact transfer-crosschain:string (sender:string receiver:string receiver-guard:guard
                                       target-chain:string amount:decimal)
    (step
      (with-capability (TRANSFER_XCHAIN sender receiver amount target-chain)
        (enforce-valid-transfer-xchain sender receiver (precision) amount)
        (enforce-valid-chain-id target-chain)
        (enforce-not-same-chain target-chain)
        (enforce-is-deployed-chain target-chain)
        (debit sender amount)
        (emit-event (TRANSFER sender "" amount))
        (let ((crosschain-details:object{fungible-xchain-sch}
                {"receiver": receiver,
                 "receiver-guard": receiver-guard,
                 "amount": amount,
                 "source-chain": (chain-id)}))
          (yield crosschain-details target-chain))))
    (step
      (resume {"receiver":= receiver,
               "receiver-guard":= receiver-guard,
               "amount":= amount,
               "source-chain":= source-chain}
        (emit-event (TRANSFER "" receiver amount))
        (emit-event (TRANSFER_XCHAIN_RECD "" receiver amount source-chain))
        (with-capability (CREDIT receiver)
          (credit receiver receiver-guard amount)))))

  ;---------------------------------------------------------------------------
  ; Initialization
  ;---------------------------------------------------------------------------
  (defun credit-allocation:string (a:object{allocation})
    (require-capability (INIT))
    (bind a {"account":=account, "guard":=guard, "amount":=amount}
      (enforce (> amount 0.0) "Allocation amount must be positive")
      (enforce-unit amount)
      ; insert fails on a repeated account, so each account appears once
      (insert launch-table account {"account": account, "amount": amount})
      (with-capability (CREDIT account)
        (credit account guard amount))))

  (defun init-supply:string (allocations:[object{allocation}])
    @doc "Mint the whole supply once, on the supply chain, to the given allocations. \
        \ The allocations must add up exactly to TOTAL-SUPPLY."
    (enforce (is-supply-chain) "Supply can only be minted on the supply chain")
    (enforce-not-initialized)
    (enforce (> (length allocations) 0) "At least one allocation is required")
    (let ((total (fold (+) 0.0 (map (at 'amount) allocations))))
      (enforce (= total TOTAL-SUPPLY)
        (format "Allocations total {} must equal the supply {}" [total, TOTAL-SUPPLY])))
    (with-capability (INIT)
      (map (credit-allocation) allocations)
      (write init-table "" {"init":true}))
    "Token initialized")

  (defun init:string ()
    @doc "Initialize the module on a non-supply chain (no minting)."
    (enforce (not (is-supply-chain)) "Use init-supply on the supply chain")
    (enforce-not-initialized)
    (with-capability (INIT)
      (write init-table "" {"init":true}))
    "Contract initialized")
)

(create-table accounts-table)
(create-table init-table)
(create-table launch-table)
