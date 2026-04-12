
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model PlatformUser
 * 
 */
export type PlatformUser = $Result.DefaultSelection<Prisma.$PlatformUserPayload>
/**
 * Model AppAccess
 * 
 */
export type AppAccess = $Result.DefaultSelection<Prisma.$AppAccessPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const AppId: {
  deposito: 'deposito',
  ale_bet: 'ale_bet'
};

export type AppId = (typeof AppId)[keyof typeof AppId]

}

export type AppId = $Enums.AppId

export const AppId: typeof $Enums.AppId

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more PlatformUsers
 * const platformUsers = await prisma.platformUser.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient({
   *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
   * })
   * // Fetch zero or more PlatformUsers
   * const platformUsers = await prisma.platformUser.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.platformUser`: Exposes CRUD operations for the **PlatformUser** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more PlatformUsers
    * const platformUsers = await prisma.platformUser.findMany()
    * ```
    */
  get platformUser(): Prisma.PlatformUserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.appAccess`: Exposes CRUD operations for the **AppAccess** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AppAccesses
    * const appAccesses = await prisma.appAccess.findMany()
    * ```
    */
  get appAccess(): Prisma.AppAccessDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 7.7.0
   * Query Engine version: 75cbdc1eb7150937890ad5465d861175c6624711
   */
  export type PrismaVersion = {
    client: string
    engine: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    PlatformUser: 'PlatformUser',
    AppAccess: 'AppAccess'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]



  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "platformUser" | "appAccess"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      PlatformUser: {
        payload: Prisma.$PlatformUserPayload<ExtArgs>
        fields: Prisma.PlatformUserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PlatformUserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PlatformUserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>
          }
          findFirst: {
            args: Prisma.PlatformUserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PlatformUserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>
          }
          findMany: {
            args: Prisma.PlatformUserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>[]
          }
          create: {
            args: Prisma.PlatformUserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>
          }
          createMany: {
            args: Prisma.PlatformUserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PlatformUserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>[]
          }
          delete: {
            args: Prisma.PlatformUserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>
          }
          update: {
            args: Prisma.PlatformUserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>
          }
          deleteMany: {
            args: Prisma.PlatformUserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PlatformUserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.PlatformUserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>[]
          }
          upsert: {
            args: Prisma.PlatformUserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlatformUserPayload>
          }
          aggregate: {
            args: Prisma.PlatformUserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePlatformUser>
          }
          groupBy: {
            args: Prisma.PlatformUserGroupByArgs<ExtArgs>
            result: $Utils.Optional<PlatformUserGroupByOutputType>[]
          }
          count: {
            args: Prisma.PlatformUserCountArgs<ExtArgs>
            result: $Utils.Optional<PlatformUserCountAggregateOutputType> | number
          }
        }
      }
      AppAccess: {
        payload: Prisma.$AppAccessPayload<ExtArgs>
        fields: Prisma.AppAccessFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AppAccessFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AppAccessFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>
          }
          findFirst: {
            args: Prisma.AppAccessFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AppAccessFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>
          }
          findMany: {
            args: Prisma.AppAccessFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>[]
          }
          create: {
            args: Prisma.AppAccessCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>
          }
          createMany: {
            args: Prisma.AppAccessCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AppAccessCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>[]
          }
          delete: {
            args: Prisma.AppAccessDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>
          }
          update: {
            args: Prisma.AppAccessUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>
          }
          deleteMany: {
            args: Prisma.AppAccessDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AppAccessUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AppAccessUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>[]
          }
          upsert: {
            args: Prisma.AppAccessUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AppAccessPayload>
          }
          aggregate: {
            args: Prisma.AppAccessAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAppAccess>
          }
          groupBy: {
            args: Prisma.AppAccessGroupByArgs<ExtArgs>
            result: $Utils.Optional<AppAccessGroupByOutputType>[]
          }
          count: {
            args: Prisma.AppAccessCountArgs<ExtArgs>
            result: $Utils.Optional<AppAccessCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://pris.ly/d/logging).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
    /**
     * SQL commenter plugins that add metadata to SQL queries as comments.
     * Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   adapter,
     *   comments: [
     *     traceContext(),
     *     queryInsights(),
     *   ],
     * })
     * ```
     */
    comments?: runtime.SqlCommenterPlugin[]
  }
  export type GlobalOmitConfig = {
    platformUser?: PlatformUserOmit
    appAccess?: AppAccessOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type PlatformUserCountOutputType
   */

  export type PlatformUserCountOutputType = {
    appAccess: number
  }

  export type PlatformUserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    appAccess?: boolean | PlatformUserCountOutputTypeCountAppAccessArgs
  }

  // Custom InputTypes
  /**
   * PlatformUserCountOutputType without action
   */
  export type PlatformUserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUserCountOutputType
     */
    select?: PlatformUserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * PlatformUserCountOutputType without action
   */
  export type PlatformUserCountOutputTypeCountAppAccessArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AppAccessWhereInput
  }


  /**
   * Models
   */

  /**
   * Model PlatformUser
   */

  export type AggregatePlatformUser = {
    _count: PlatformUserCountAggregateOutputType | null
    _min: PlatformUserMinAggregateOutputType | null
    _max: PlatformUserMaxAggregateOutputType | null
  }

  export type PlatformUserMinAggregateOutputType = {
    id: string | null
    email: string | null
    nombre: string | null
    password: string | null
    activo: boolean | null
    isPlatformAdmin: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PlatformUserMaxAggregateOutputType = {
    id: string | null
    email: string | null
    nombre: string | null
    password: string | null
    activo: boolean | null
    isPlatformAdmin: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PlatformUserCountAggregateOutputType = {
    id: number
    email: number
    nombre: number
    password: number
    activo: number
    isPlatformAdmin: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PlatformUserMinAggregateInputType = {
    id?: true
    email?: true
    nombre?: true
    password?: true
    activo?: true
    isPlatformAdmin?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PlatformUserMaxAggregateInputType = {
    id?: true
    email?: true
    nombre?: true
    password?: true
    activo?: true
    isPlatformAdmin?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PlatformUserCountAggregateInputType = {
    id?: true
    email?: true
    nombre?: true
    password?: true
    activo?: true
    isPlatformAdmin?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PlatformUserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PlatformUser to aggregate.
     */
    where?: PlatformUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlatformUsers to fetch.
     */
    orderBy?: PlatformUserOrderByWithRelationInput | PlatformUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PlatformUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlatformUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlatformUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned PlatformUsers
    **/
    _count?: true | PlatformUserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PlatformUserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PlatformUserMaxAggregateInputType
  }

  export type GetPlatformUserAggregateType<T extends PlatformUserAggregateArgs> = {
        [P in keyof T & keyof AggregatePlatformUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePlatformUser[P]>
      : GetScalarType<T[P], AggregatePlatformUser[P]>
  }




  export type PlatformUserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlatformUserWhereInput
    orderBy?: PlatformUserOrderByWithAggregationInput | PlatformUserOrderByWithAggregationInput[]
    by: PlatformUserScalarFieldEnum[] | PlatformUserScalarFieldEnum
    having?: PlatformUserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PlatformUserCountAggregateInputType | true
    _min?: PlatformUserMinAggregateInputType
    _max?: PlatformUserMaxAggregateInputType
  }

  export type PlatformUserGroupByOutputType = {
    id: string
    email: string
    nombre: string
    password: string
    activo: boolean
    isPlatformAdmin: boolean
    createdAt: Date
    updatedAt: Date
    _count: PlatformUserCountAggregateOutputType | null
    _min: PlatformUserMinAggregateOutputType | null
    _max: PlatformUserMaxAggregateOutputType | null
  }

  type GetPlatformUserGroupByPayload<T extends PlatformUserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PlatformUserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PlatformUserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PlatformUserGroupByOutputType[P]>
            : GetScalarType<T[P], PlatformUserGroupByOutputType[P]>
        }
      >
    >


  export type PlatformUserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    nombre?: boolean
    password?: boolean
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    appAccess?: boolean | PlatformUser$appAccessArgs<ExtArgs>
    _count?: boolean | PlatformUserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["platformUser"]>

  export type PlatformUserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    nombre?: boolean
    password?: boolean
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["platformUser"]>

  export type PlatformUserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    nombre?: boolean
    password?: boolean
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["platformUser"]>

  export type PlatformUserSelectScalar = {
    id?: boolean
    email?: boolean
    nombre?: boolean
    password?: boolean
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type PlatformUserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "email" | "nombre" | "password" | "activo" | "isPlatformAdmin" | "createdAt" | "updatedAt", ExtArgs["result"]["platformUser"]>
  export type PlatformUserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    appAccess?: boolean | PlatformUser$appAccessArgs<ExtArgs>
    _count?: boolean | PlatformUserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type PlatformUserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type PlatformUserIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $PlatformUserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "PlatformUser"
    objects: {
      appAccess: Prisma.$AppAccessPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      email: string
      nombre: string
      password: string
      activo: boolean
      isPlatformAdmin: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["platformUser"]>
    composites: {}
  }

  type PlatformUserGetPayload<S extends boolean | null | undefined | PlatformUserDefaultArgs> = $Result.GetResult<Prisma.$PlatformUserPayload, S>

  type PlatformUserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PlatformUserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PlatformUserCountAggregateInputType | true
    }

  export interface PlatformUserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['PlatformUser'], meta: { name: 'PlatformUser' } }
    /**
     * Find zero or one PlatformUser that matches the filter.
     * @param {PlatformUserFindUniqueArgs} args - Arguments to find a PlatformUser
     * @example
     * // Get one PlatformUser
     * const platformUser = await prisma.platformUser.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PlatformUserFindUniqueArgs>(args: SelectSubset<T, PlatformUserFindUniqueArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one PlatformUser that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PlatformUserFindUniqueOrThrowArgs} args - Arguments to find a PlatformUser
     * @example
     * // Get one PlatformUser
     * const platformUser = await prisma.platformUser.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PlatformUserFindUniqueOrThrowArgs>(args: SelectSubset<T, PlatformUserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first PlatformUser that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserFindFirstArgs} args - Arguments to find a PlatformUser
     * @example
     * // Get one PlatformUser
     * const platformUser = await prisma.platformUser.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PlatformUserFindFirstArgs>(args?: SelectSubset<T, PlatformUserFindFirstArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first PlatformUser that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserFindFirstOrThrowArgs} args - Arguments to find a PlatformUser
     * @example
     * // Get one PlatformUser
     * const platformUser = await prisma.platformUser.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PlatformUserFindFirstOrThrowArgs>(args?: SelectSubset<T, PlatformUserFindFirstOrThrowArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more PlatformUsers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PlatformUsers
     * const platformUsers = await prisma.platformUser.findMany()
     * 
     * // Get first 10 PlatformUsers
     * const platformUsers = await prisma.platformUser.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const platformUserWithIdOnly = await prisma.platformUser.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PlatformUserFindManyArgs>(args?: SelectSubset<T, PlatformUserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a PlatformUser.
     * @param {PlatformUserCreateArgs} args - Arguments to create a PlatformUser.
     * @example
     * // Create one PlatformUser
     * const PlatformUser = await prisma.platformUser.create({
     *   data: {
     *     // ... data to create a PlatformUser
     *   }
     * })
     * 
     */
    create<T extends PlatformUserCreateArgs>(args: SelectSubset<T, PlatformUserCreateArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many PlatformUsers.
     * @param {PlatformUserCreateManyArgs} args - Arguments to create many PlatformUsers.
     * @example
     * // Create many PlatformUsers
     * const platformUser = await prisma.platformUser.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PlatformUserCreateManyArgs>(args?: SelectSubset<T, PlatformUserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many PlatformUsers and returns the data saved in the database.
     * @param {PlatformUserCreateManyAndReturnArgs} args - Arguments to create many PlatformUsers.
     * @example
     * // Create many PlatformUsers
     * const platformUser = await prisma.platformUser.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many PlatformUsers and only return the `id`
     * const platformUserWithIdOnly = await prisma.platformUser.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PlatformUserCreateManyAndReturnArgs>(args?: SelectSubset<T, PlatformUserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a PlatformUser.
     * @param {PlatformUserDeleteArgs} args - Arguments to delete one PlatformUser.
     * @example
     * // Delete one PlatformUser
     * const PlatformUser = await prisma.platformUser.delete({
     *   where: {
     *     // ... filter to delete one PlatformUser
     *   }
     * })
     * 
     */
    delete<T extends PlatformUserDeleteArgs>(args: SelectSubset<T, PlatformUserDeleteArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one PlatformUser.
     * @param {PlatformUserUpdateArgs} args - Arguments to update one PlatformUser.
     * @example
     * // Update one PlatformUser
     * const platformUser = await prisma.platformUser.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PlatformUserUpdateArgs>(args: SelectSubset<T, PlatformUserUpdateArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more PlatformUsers.
     * @param {PlatformUserDeleteManyArgs} args - Arguments to filter PlatformUsers to delete.
     * @example
     * // Delete a few PlatformUsers
     * const { count } = await prisma.platformUser.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PlatformUserDeleteManyArgs>(args?: SelectSubset<T, PlatformUserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PlatformUsers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PlatformUsers
     * const platformUser = await prisma.platformUser.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PlatformUserUpdateManyArgs>(args: SelectSubset<T, PlatformUserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PlatformUsers and returns the data updated in the database.
     * @param {PlatformUserUpdateManyAndReturnArgs} args - Arguments to update many PlatformUsers.
     * @example
     * // Update many PlatformUsers
     * const platformUser = await prisma.platformUser.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more PlatformUsers and only return the `id`
     * const platformUserWithIdOnly = await prisma.platformUser.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends PlatformUserUpdateManyAndReturnArgs>(args: SelectSubset<T, PlatformUserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one PlatformUser.
     * @param {PlatformUserUpsertArgs} args - Arguments to update or create a PlatformUser.
     * @example
     * // Update or create a PlatformUser
     * const platformUser = await prisma.platformUser.upsert({
     *   create: {
     *     // ... data to create a PlatformUser
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PlatformUser we want to update
     *   }
     * })
     */
    upsert<T extends PlatformUserUpsertArgs>(args: SelectSubset<T, PlatformUserUpsertArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of PlatformUsers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserCountArgs} args - Arguments to filter PlatformUsers to count.
     * @example
     * // Count the number of PlatformUsers
     * const count = await prisma.platformUser.count({
     *   where: {
     *     // ... the filter for the PlatformUsers we want to count
     *   }
     * })
    **/
    count<T extends PlatformUserCountArgs>(
      args?: Subset<T, PlatformUserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PlatformUserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a PlatformUser.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PlatformUserAggregateArgs>(args: Subset<T, PlatformUserAggregateArgs>): Prisma.PrismaPromise<GetPlatformUserAggregateType<T>>

    /**
     * Group by PlatformUser.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlatformUserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PlatformUserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PlatformUserGroupByArgs['orderBy'] }
        : { orderBy?: PlatformUserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PlatformUserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPlatformUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the PlatformUser model
   */
  readonly fields: PlatformUserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for PlatformUser.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PlatformUserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    appAccess<T extends PlatformUser$appAccessArgs<ExtArgs> = {}>(args?: Subset<T, PlatformUser$appAccessArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the PlatformUser model
   */
  interface PlatformUserFieldRefs {
    readonly id: FieldRef<"PlatformUser", 'String'>
    readonly email: FieldRef<"PlatformUser", 'String'>
    readonly nombre: FieldRef<"PlatformUser", 'String'>
    readonly password: FieldRef<"PlatformUser", 'String'>
    readonly activo: FieldRef<"PlatformUser", 'Boolean'>
    readonly isPlatformAdmin: FieldRef<"PlatformUser", 'Boolean'>
    readonly createdAt: FieldRef<"PlatformUser", 'DateTime'>
    readonly updatedAt: FieldRef<"PlatformUser", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * PlatformUser findUnique
   */
  export type PlatformUserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * Filter, which PlatformUser to fetch.
     */
    where: PlatformUserWhereUniqueInput
  }

  /**
   * PlatformUser findUniqueOrThrow
   */
  export type PlatformUserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * Filter, which PlatformUser to fetch.
     */
    where: PlatformUserWhereUniqueInput
  }

  /**
   * PlatformUser findFirst
   */
  export type PlatformUserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * Filter, which PlatformUser to fetch.
     */
    where?: PlatformUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlatformUsers to fetch.
     */
    orderBy?: PlatformUserOrderByWithRelationInput | PlatformUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PlatformUsers.
     */
    cursor?: PlatformUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlatformUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlatformUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PlatformUsers.
     */
    distinct?: PlatformUserScalarFieldEnum | PlatformUserScalarFieldEnum[]
  }

  /**
   * PlatformUser findFirstOrThrow
   */
  export type PlatformUserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * Filter, which PlatformUser to fetch.
     */
    where?: PlatformUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlatformUsers to fetch.
     */
    orderBy?: PlatformUserOrderByWithRelationInput | PlatformUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PlatformUsers.
     */
    cursor?: PlatformUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlatformUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlatformUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PlatformUsers.
     */
    distinct?: PlatformUserScalarFieldEnum | PlatformUserScalarFieldEnum[]
  }

  /**
   * PlatformUser findMany
   */
  export type PlatformUserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * Filter, which PlatformUsers to fetch.
     */
    where?: PlatformUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlatformUsers to fetch.
     */
    orderBy?: PlatformUserOrderByWithRelationInput | PlatformUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing PlatformUsers.
     */
    cursor?: PlatformUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlatformUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlatformUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PlatformUsers.
     */
    distinct?: PlatformUserScalarFieldEnum | PlatformUserScalarFieldEnum[]
  }

  /**
   * PlatformUser create
   */
  export type PlatformUserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * The data needed to create a PlatformUser.
     */
    data: XOR<PlatformUserCreateInput, PlatformUserUncheckedCreateInput>
  }

  /**
   * PlatformUser createMany
   */
  export type PlatformUserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many PlatformUsers.
     */
    data: PlatformUserCreateManyInput | PlatformUserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * PlatformUser createManyAndReturn
   */
  export type PlatformUserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * The data used to create many PlatformUsers.
     */
    data: PlatformUserCreateManyInput | PlatformUserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * PlatformUser update
   */
  export type PlatformUserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * The data needed to update a PlatformUser.
     */
    data: XOR<PlatformUserUpdateInput, PlatformUserUncheckedUpdateInput>
    /**
     * Choose, which PlatformUser to update.
     */
    where: PlatformUserWhereUniqueInput
  }

  /**
   * PlatformUser updateMany
   */
  export type PlatformUserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update PlatformUsers.
     */
    data: XOR<PlatformUserUpdateManyMutationInput, PlatformUserUncheckedUpdateManyInput>
    /**
     * Filter which PlatformUsers to update
     */
    where?: PlatformUserWhereInput
    /**
     * Limit how many PlatformUsers to update.
     */
    limit?: number
  }

  /**
   * PlatformUser updateManyAndReturn
   */
  export type PlatformUserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * The data used to update PlatformUsers.
     */
    data: XOR<PlatformUserUpdateManyMutationInput, PlatformUserUncheckedUpdateManyInput>
    /**
     * Filter which PlatformUsers to update
     */
    where?: PlatformUserWhereInput
    /**
     * Limit how many PlatformUsers to update.
     */
    limit?: number
  }

  /**
   * PlatformUser upsert
   */
  export type PlatformUserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * The filter to search for the PlatformUser to update in case it exists.
     */
    where: PlatformUserWhereUniqueInput
    /**
     * In case the PlatformUser found by the `where` argument doesn't exist, create a new PlatformUser with this data.
     */
    create: XOR<PlatformUserCreateInput, PlatformUserUncheckedCreateInput>
    /**
     * In case the PlatformUser was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PlatformUserUpdateInput, PlatformUserUncheckedUpdateInput>
  }

  /**
   * PlatformUser delete
   */
  export type PlatformUserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
    /**
     * Filter which PlatformUser to delete.
     */
    where: PlatformUserWhereUniqueInput
  }

  /**
   * PlatformUser deleteMany
   */
  export type PlatformUserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PlatformUsers to delete
     */
    where?: PlatformUserWhereInput
    /**
     * Limit how many PlatformUsers to delete.
     */
    limit?: number
  }

  /**
   * PlatformUser.appAccess
   */
  export type PlatformUser$appAccessArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    where?: AppAccessWhereInput
    orderBy?: AppAccessOrderByWithRelationInput | AppAccessOrderByWithRelationInput[]
    cursor?: AppAccessWhereUniqueInput
    take?: number
    skip?: number
    distinct?: AppAccessScalarFieldEnum | AppAccessScalarFieldEnum[]
  }

  /**
   * PlatformUser without action
   */
  export type PlatformUserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlatformUser
     */
    select?: PlatformUserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PlatformUser
     */
    omit?: PlatformUserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlatformUserInclude<ExtArgs> | null
  }


  /**
   * Model AppAccess
   */

  export type AggregateAppAccess = {
    _count: AppAccessCountAggregateOutputType | null
    _min: AppAccessMinAggregateOutputType | null
    _max: AppAccessMaxAggregateOutputType | null
  }

  export type AppAccessMinAggregateOutputType = {
    id: string | null
    userId: string | null
    app: $Enums.AppId | null
    rol: string | null
    activo: boolean | null
    createdAt: Date | null
  }

  export type AppAccessMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    app: $Enums.AppId | null
    rol: string | null
    activo: boolean | null
    createdAt: Date | null
  }

  export type AppAccessCountAggregateOutputType = {
    id: number
    userId: number
    app: number
    rol: number
    activo: number
    createdAt: number
    _all: number
  }


  export type AppAccessMinAggregateInputType = {
    id?: true
    userId?: true
    app?: true
    rol?: true
    activo?: true
    createdAt?: true
  }

  export type AppAccessMaxAggregateInputType = {
    id?: true
    userId?: true
    app?: true
    rol?: true
    activo?: true
    createdAt?: true
  }

  export type AppAccessCountAggregateInputType = {
    id?: true
    userId?: true
    app?: true
    rol?: true
    activo?: true
    createdAt?: true
    _all?: true
  }

  export type AppAccessAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AppAccess to aggregate.
     */
    where?: AppAccessWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AppAccesses to fetch.
     */
    orderBy?: AppAccessOrderByWithRelationInput | AppAccessOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AppAccessWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AppAccesses from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AppAccesses.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AppAccesses
    **/
    _count?: true | AppAccessCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AppAccessMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AppAccessMaxAggregateInputType
  }

  export type GetAppAccessAggregateType<T extends AppAccessAggregateArgs> = {
        [P in keyof T & keyof AggregateAppAccess]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAppAccess[P]>
      : GetScalarType<T[P], AggregateAppAccess[P]>
  }




  export type AppAccessGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AppAccessWhereInput
    orderBy?: AppAccessOrderByWithAggregationInput | AppAccessOrderByWithAggregationInput[]
    by: AppAccessScalarFieldEnum[] | AppAccessScalarFieldEnum
    having?: AppAccessScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AppAccessCountAggregateInputType | true
    _min?: AppAccessMinAggregateInputType
    _max?: AppAccessMaxAggregateInputType
  }

  export type AppAccessGroupByOutputType = {
    id: string
    userId: string
    app: $Enums.AppId
    rol: string
    activo: boolean
    createdAt: Date
    _count: AppAccessCountAggregateOutputType | null
    _min: AppAccessMinAggregateOutputType | null
    _max: AppAccessMaxAggregateOutputType | null
  }

  type GetAppAccessGroupByPayload<T extends AppAccessGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AppAccessGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AppAccessGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AppAccessGroupByOutputType[P]>
            : GetScalarType<T[P], AppAccessGroupByOutputType[P]>
        }
      >
    >


  export type AppAccessSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    app?: boolean
    rol?: boolean
    activo?: boolean
    createdAt?: boolean
    user?: boolean | PlatformUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["appAccess"]>

  export type AppAccessSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    app?: boolean
    rol?: boolean
    activo?: boolean
    createdAt?: boolean
    user?: boolean | PlatformUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["appAccess"]>

  export type AppAccessSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    app?: boolean
    rol?: boolean
    activo?: boolean
    createdAt?: boolean
    user?: boolean | PlatformUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["appAccess"]>

  export type AppAccessSelectScalar = {
    id?: boolean
    userId?: boolean
    app?: boolean
    rol?: boolean
    activo?: boolean
    createdAt?: boolean
  }

  export type AppAccessOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "app" | "rol" | "activo" | "createdAt", ExtArgs["result"]["appAccess"]>
  export type AppAccessInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | PlatformUserDefaultArgs<ExtArgs>
  }
  export type AppAccessIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | PlatformUserDefaultArgs<ExtArgs>
  }
  export type AppAccessIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | PlatformUserDefaultArgs<ExtArgs>
  }

  export type $AppAccessPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AppAccess"
    objects: {
      user: Prisma.$PlatformUserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      app: $Enums.AppId
      rol: string
      activo: boolean
      createdAt: Date
    }, ExtArgs["result"]["appAccess"]>
    composites: {}
  }

  type AppAccessGetPayload<S extends boolean | null | undefined | AppAccessDefaultArgs> = $Result.GetResult<Prisma.$AppAccessPayload, S>

  type AppAccessCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AppAccessFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AppAccessCountAggregateInputType | true
    }

  export interface AppAccessDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AppAccess'], meta: { name: 'AppAccess' } }
    /**
     * Find zero or one AppAccess that matches the filter.
     * @param {AppAccessFindUniqueArgs} args - Arguments to find a AppAccess
     * @example
     * // Get one AppAccess
     * const appAccess = await prisma.appAccess.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AppAccessFindUniqueArgs>(args: SelectSubset<T, AppAccessFindUniqueArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AppAccess that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AppAccessFindUniqueOrThrowArgs} args - Arguments to find a AppAccess
     * @example
     * // Get one AppAccess
     * const appAccess = await prisma.appAccess.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AppAccessFindUniqueOrThrowArgs>(args: SelectSubset<T, AppAccessFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AppAccess that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessFindFirstArgs} args - Arguments to find a AppAccess
     * @example
     * // Get one AppAccess
     * const appAccess = await prisma.appAccess.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AppAccessFindFirstArgs>(args?: SelectSubset<T, AppAccessFindFirstArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AppAccess that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessFindFirstOrThrowArgs} args - Arguments to find a AppAccess
     * @example
     * // Get one AppAccess
     * const appAccess = await prisma.appAccess.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AppAccessFindFirstOrThrowArgs>(args?: SelectSubset<T, AppAccessFindFirstOrThrowArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AppAccesses that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AppAccesses
     * const appAccesses = await prisma.appAccess.findMany()
     * 
     * // Get first 10 AppAccesses
     * const appAccesses = await prisma.appAccess.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const appAccessWithIdOnly = await prisma.appAccess.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AppAccessFindManyArgs>(args?: SelectSubset<T, AppAccessFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AppAccess.
     * @param {AppAccessCreateArgs} args - Arguments to create a AppAccess.
     * @example
     * // Create one AppAccess
     * const AppAccess = await prisma.appAccess.create({
     *   data: {
     *     // ... data to create a AppAccess
     *   }
     * })
     * 
     */
    create<T extends AppAccessCreateArgs>(args: SelectSubset<T, AppAccessCreateArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AppAccesses.
     * @param {AppAccessCreateManyArgs} args - Arguments to create many AppAccesses.
     * @example
     * // Create many AppAccesses
     * const appAccess = await prisma.appAccess.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AppAccessCreateManyArgs>(args?: SelectSubset<T, AppAccessCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AppAccesses and returns the data saved in the database.
     * @param {AppAccessCreateManyAndReturnArgs} args - Arguments to create many AppAccesses.
     * @example
     * // Create many AppAccesses
     * const appAccess = await prisma.appAccess.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AppAccesses and only return the `id`
     * const appAccessWithIdOnly = await prisma.appAccess.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AppAccessCreateManyAndReturnArgs>(args?: SelectSubset<T, AppAccessCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AppAccess.
     * @param {AppAccessDeleteArgs} args - Arguments to delete one AppAccess.
     * @example
     * // Delete one AppAccess
     * const AppAccess = await prisma.appAccess.delete({
     *   where: {
     *     // ... filter to delete one AppAccess
     *   }
     * })
     * 
     */
    delete<T extends AppAccessDeleteArgs>(args: SelectSubset<T, AppAccessDeleteArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AppAccess.
     * @param {AppAccessUpdateArgs} args - Arguments to update one AppAccess.
     * @example
     * // Update one AppAccess
     * const appAccess = await prisma.appAccess.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AppAccessUpdateArgs>(args: SelectSubset<T, AppAccessUpdateArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AppAccesses.
     * @param {AppAccessDeleteManyArgs} args - Arguments to filter AppAccesses to delete.
     * @example
     * // Delete a few AppAccesses
     * const { count } = await prisma.appAccess.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AppAccessDeleteManyArgs>(args?: SelectSubset<T, AppAccessDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AppAccesses.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AppAccesses
     * const appAccess = await prisma.appAccess.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AppAccessUpdateManyArgs>(args: SelectSubset<T, AppAccessUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AppAccesses and returns the data updated in the database.
     * @param {AppAccessUpdateManyAndReturnArgs} args - Arguments to update many AppAccesses.
     * @example
     * // Update many AppAccesses
     * const appAccess = await prisma.appAccess.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AppAccesses and only return the `id`
     * const appAccessWithIdOnly = await prisma.appAccess.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AppAccessUpdateManyAndReturnArgs>(args: SelectSubset<T, AppAccessUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AppAccess.
     * @param {AppAccessUpsertArgs} args - Arguments to update or create a AppAccess.
     * @example
     * // Update or create a AppAccess
     * const appAccess = await prisma.appAccess.upsert({
     *   create: {
     *     // ... data to create a AppAccess
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AppAccess we want to update
     *   }
     * })
     */
    upsert<T extends AppAccessUpsertArgs>(args: SelectSubset<T, AppAccessUpsertArgs<ExtArgs>>): Prisma__AppAccessClient<$Result.GetResult<Prisma.$AppAccessPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AppAccesses.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessCountArgs} args - Arguments to filter AppAccesses to count.
     * @example
     * // Count the number of AppAccesses
     * const count = await prisma.appAccess.count({
     *   where: {
     *     // ... the filter for the AppAccesses we want to count
     *   }
     * })
    **/
    count<T extends AppAccessCountArgs>(
      args?: Subset<T, AppAccessCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AppAccessCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AppAccess.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AppAccessAggregateArgs>(args: Subset<T, AppAccessAggregateArgs>): Prisma.PrismaPromise<GetAppAccessAggregateType<T>>

    /**
     * Group by AppAccess.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AppAccessGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AppAccessGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AppAccessGroupByArgs['orderBy'] }
        : { orderBy?: AppAccessGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AppAccessGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAppAccessGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AppAccess model
   */
  readonly fields: AppAccessFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AppAccess.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AppAccessClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends PlatformUserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PlatformUserDefaultArgs<ExtArgs>>): Prisma__PlatformUserClient<$Result.GetResult<Prisma.$PlatformUserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AppAccess model
   */
  interface AppAccessFieldRefs {
    readonly id: FieldRef<"AppAccess", 'String'>
    readonly userId: FieldRef<"AppAccess", 'String'>
    readonly app: FieldRef<"AppAccess", 'AppId'>
    readonly rol: FieldRef<"AppAccess", 'String'>
    readonly activo: FieldRef<"AppAccess", 'Boolean'>
    readonly createdAt: FieldRef<"AppAccess", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AppAccess findUnique
   */
  export type AppAccessFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * Filter, which AppAccess to fetch.
     */
    where: AppAccessWhereUniqueInput
  }

  /**
   * AppAccess findUniqueOrThrow
   */
  export type AppAccessFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * Filter, which AppAccess to fetch.
     */
    where: AppAccessWhereUniqueInput
  }

  /**
   * AppAccess findFirst
   */
  export type AppAccessFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * Filter, which AppAccess to fetch.
     */
    where?: AppAccessWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AppAccesses to fetch.
     */
    orderBy?: AppAccessOrderByWithRelationInput | AppAccessOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AppAccesses.
     */
    cursor?: AppAccessWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AppAccesses from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AppAccesses.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AppAccesses.
     */
    distinct?: AppAccessScalarFieldEnum | AppAccessScalarFieldEnum[]
  }

  /**
   * AppAccess findFirstOrThrow
   */
  export type AppAccessFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * Filter, which AppAccess to fetch.
     */
    where?: AppAccessWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AppAccesses to fetch.
     */
    orderBy?: AppAccessOrderByWithRelationInput | AppAccessOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AppAccesses.
     */
    cursor?: AppAccessWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AppAccesses from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AppAccesses.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AppAccesses.
     */
    distinct?: AppAccessScalarFieldEnum | AppAccessScalarFieldEnum[]
  }

  /**
   * AppAccess findMany
   */
  export type AppAccessFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * Filter, which AppAccesses to fetch.
     */
    where?: AppAccessWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AppAccesses to fetch.
     */
    orderBy?: AppAccessOrderByWithRelationInput | AppAccessOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AppAccesses.
     */
    cursor?: AppAccessWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AppAccesses from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AppAccesses.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AppAccesses.
     */
    distinct?: AppAccessScalarFieldEnum | AppAccessScalarFieldEnum[]
  }

  /**
   * AppAccess create
   */
  export type AppAccessCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * The data needed to create a AppAccess.
     */
    data: XOR<AppAccessCreateInput, AppAccessUncheckedCreateInput>
  }

  /**
   * AppAccess createMany
   */
  export type AppAccessCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AppAccesses.
     */
    data: AppAccessCreateManyInput | AppAccessCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AppAccess createManyAndReturn
   */
  export type AppAccessCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * The data used to create many AppAccesses.
     */
    data: AppAccessCreateManyInput | AppAccessCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * AppAccess update
   */
  export type AppAccessUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * The data needed to update a AppAccess.
     */
    data: XOR<AppAccessUpdateInput, AppAccessUncheckedUpdateInput>
    /**
     * Choose, which AppAccess to update.
     */
    where: AppAccessWhereUniqueInput
  }

  /**
   * AppAccess updateMany
   */
  export type AppAccessUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AppAccesses.
     */
    data: XOR<AppAccessUpdateManyMutationInput, AppAccessUncheckedUpdateManyInput>
    /**
     * Filter which AppAccesses to update
     */
    where?: AppAccessWhereInput
    /**
     * Limit how many AppAccesses to update.
     */
    limit?: number
  }

  /**
   * AppAccess updateManyAndReturn
   */
  export type AppAccessUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * The data used to update AppAccesses.
     */
    data: XOR<AppAccessUpdateManyMutationInput, AppAccessUncheckedUpdateManyInput>
    /**
     * Filter which AppAccesses to update
     */
    where?: AppAccessWhereInput
    /**
     * Limit how many AppAccesses to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * AppAccess upsert
   */
  export type AppAccessUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * The filter to search for the AppAccess to update in case it exists.
     */
    where: AppAccessWhereUniqueInput
    /**
     * In case the AppAccess found by the `where` argument doesn't exist, create a new AppAccess with this data.
     */
    create: XOR<AppAccessCreateInput, AppAccessUncheckedCreateInput>
    /**
     * In case the AppAccess was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AppAccessUpdateInput, AppAccessUncheckedUpdateInput>
  }

  /**
   * AppAccess delete
   */
  export type AppAccessDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
    /**
     * Filter which AppAccess to delete.
     */
    where: AppAccessWhereUniqueInput
  }

  /**
   * AppAccess deleteMany
   */
  export type AppAccessDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AppAccesses to delete
     */
    where?: AppAccessWhereInput
    /**
     * Limit how many AppAccesses to delete.
     */
    limit?: number
  }

  /**
   * AppAccess without action
   */
  export type AppAccessDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AppAccess
     */
    select?: AppAccessSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AppAccess
     */
    omit?: AppAccessOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AppAccessInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const PlatformUserScalarFieldEnum: {
    id: 'id',
    email: 'email',
    nombre: 'nombre',
    password: 'password',
    activo: 'activo',
    isPlatformAdmin: 'isPlatformAdmin',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PlatformUserScalarFieldEnum = (typeof PlatformUserScalarFieldEnum)[keyof typeof PlatformUserScalarFieldEnum]


  export const AppAccessScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    app: 'app',
    rol: 'rol',
    activo: 'activo',
    createdAt: 'createdAt'
  };

  export type AppAccessScalarFieldEnum = (typeof AppAccessScalarFieldEnum)[keyof typeof AppAccessScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'AppId'
   */
  export type EnumAppIdFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AppId'>
    


  /**
   * Reference to a field of type 'AppId[]'
   */
  export type ListEnumAppIdFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AppId[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    
  /**
   * Deep Input Types
   */


  export type PlatformUserWhereInput = {
    AND?: PlatformUserWhereInput | PlatformUserWhereInput[]
    OR?: PlatformUserWhereInput[]
    NOT?: PlatformUserWhereInput | PlatformUserWhereInput[]
    id?: StringFilter<"PlatformUser"> | string
    email?: StringFilter<"PlatformUser"> | string
    nombre?: StringFilter<"PlatformUser"> | string
    password?: StringFilter<"PlatformUser"> | string
    activo?: BoolFilter<"PlatformUser"> | boolean
    isPlatformAdmin?: BoolFilter<"PlatformUser"> | boolean
    createdAt?: DateTimeFilter<"PlatformUser"> | Date | string
    updatedAt?: DateTimeFilter<"PlatformUser"> | Date | string
    appAccess?: AppAccessListRelationFilter
  }

  export type PlatformUserOrderByWithRelationInput = {
    id?: SortOrder
    email?: SortOrder
    nombre?: SortOrder
    password?: SortOrder
    activo?: SortOrder
    isPlatformAdmin?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    appAccess?: AppAccessOrderByRelationAggregateInput
  }

  export type PlatformUserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    email?: string
    AND?: PlatformUserWhereInput | PlatformUserWhereInput[]
    OR?: PlatformUserWhereInput[]
    NOT?: PlatformUserWhereInput | PlatformUserWhereInput[]
    nombre?: StringFilter<"PlatformUser"> | string
    password?: StringFilter<"PlatformUser"> | string
    activo?: BoolFilter<"PlatformUser"> | boolean
    isPlatformAdmin?: BoolFilter<"PlatformUser"> | boolean
    createdAt?: DateTimeFilter<"PlatformUser"> | Date | string
    updatedAt?: DateTimeFilter<"PlatformUser"> | Date | string
    appAccess?: AppAccessListRelationFilter
  }, "id" | "email">

  export type PlatformUserOrderByWithAggregationInput = {
    id?: SortOrder
    email?: SortOrder
    nombre?: SortOrder
    password?: SortOrder
    activo?: SortOrder
    isPlatformAdmin?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PlatformUserCountOrderByAggregateInput
    _max?: PlatformUserMaxOrderByAggregateInput
    _min?: PlatformUserMinOrderByAggregateInput
  }

  export type PlatformUserScalarWhereWithAggregatesInput = {
    AND?: PlatformUserScalarWhereWithAggregatesInput | PlatformUserScalarWhereWithAggregatesInput[]
    OR?: PlatformUserScalarWhereWithAggregatesInput[]
    NOT?: PlatformUserScalarWhereWithAggregatesInput | PlatformUserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"PlatformUser"> | string
    email?: StringWithAggregatesFilter<"PlatformUser"> | string
    nombre?: StringWithAggregatesFilter<"PlatformUser"> | string
    password?: StringWithAggregatesFilter<"PlatformUser"> | string
    activo?: BoolWithAggregatesFilter<"PlatformUser"> | boolean
    isPlatformAdmin?: BoolWithAggregatesFilter<"PlatformUser"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"PlatformUser"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"PlatformUser"> | Date | string
  }

  export type AppAccessWhereInput = {
    AND?: AppAccessWhereInput | AppAccessWhereInput[]
    OR?: AppAccessWhereInput[]
    NOT?: AppAccessWhereInput | AppAccessWhereInput[]
    id?: StringFilter<"AppAccess"> | string
    userId?: StringFilter<"AppAccess"> | string
    app?: EnumAppIdFilter<"AppAccess"> | $Enums.AppId
    rol?: StringFilter<"AppAccess"> | string
    activo?: BoolFilter<"AppAccess"> | boolean
    createdAt?: DateTimeFilter<"AppAccess"> | Date | string
    user?: XOR<PlatformUserScalarRelationFilter, PlatformUserWhereInput>
  }

  export type AppAccessOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    app?: SortOrder
    rol?: SortOrder
    activo?: SortOrder
    createdAt?: SortOrder
    user?: PlatformUserOrderByWithRelationInput
  }

  export type AppAccessWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    userId_app?: AppAccessUserIdAppCompoundUniqueInput
    AND?: AppAccessWhereInput | AppAccessWhereInput[]
    OR?: AppAccessWhereInput[]
    NOT?: AppAccessWhereInput | AppAccessWhereInput[]
    userId?: StringFilter<"AppAccess"> | string
    app?: EnumAppIdFilter<"AppAccess"> | $Enums.AppId
    rol?: StringFilter<"AppAccess"> | string
    activo?: BoolFilter<"AppAccess"> | boolean
    createdAt?: DateTimeFilter<"AppAccess"> | Date | string
    user?: XOR<PlatformUserScalarRelationFilter, PlatformUserWhereInput>
  }, "id" | "userId_app">

  export type AppAccessOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    app?: SortOrder
    rol?: SortOrder
    activo?: SortOrder
    createdAt?: SortOrder
    _count?: AppAccessCountOrderByAggregateInput
    _max?: AppAccessMaxOrderByAggregateInput
    _min?: AppAccessMinOrderByAggregateInput
  }

  export type AppAccessScalarWhereWithAggregatesInput = {
    AND?: AppAccessScalarWhereWithAggregatesInput | AppAccessScalarWhereWithAggregatesInput[]
    OR?: AppAccessScalarWhereWithAggregatesInput[]
    NOT?: AppAccessScalarWhereWithAggregatesInput | AppAccessScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AppAccess"> | string
    userId?: StringWithAggregatesFilter<"AppAccess"> | string
    app?: EnumAppIdWithAggregatesFilter<"AppAccess"> | $Enums.AppId
    rol?: StringWithAggregatesFilter<"AppAccess"> | string
    activo?: BoolWithAggregatesFilter<"AppAccess"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"AppAccess"> | Date | string
  }

  export type PlatformUserCreateInput = {
    id?: string
    email: string
    nombre: string
    password: string
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    appAccess?: AppAccessCreateNestedManyWithoutUserInput
  }

  export type PlatformUserUncheckedCreateInput = {
    id?: string
    email: string
    nombre: string
    password: string
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    appAccess?: AppAccessUncheckedCreateNestedManyWithoutUserInput
  }

  export type PlatformUserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    nombre?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    isPlatformAdmin?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    appAccess?: AppAccessUpdateManyWithoutUserNestedInput
  }

  export type PlatformUserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    nombre?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    isPlatformAdmin?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    appAccess?: AppAccessUncheckedUpdateManyWithoutUserNestedInput
  }

  export type PlatformUserCreateManyInput = {
    id?: string
    email: string
    nombre: string
    password: string
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlatformUserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    nombre?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    isPlatformAdmin?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlatformUserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    nombre?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    isPlatformAdmin?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AppAccessCreateInput = {
    id?: string
    app: $Enums.AppId
    rol: string
    activo?: boolean
    createdAt?: Date | string
    user: PlatformUserCreateNestedOneWithoutAppAccessInput
  }

  export type AppAccessUncheckedCreateInput = {
    id?: string
    userId: string
    app: $Enums.AppId
    rol: string
    activo?: boolean
    createdAt?: Date | string
  }

  export type AppAccessUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: PlatformUserUpdateOneRequiredWithoutAppAccessNestedInput
  }

  export type AppAccessUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AppAccessCreateManyInput = {
    id?: string
    userId: string
    app: $Enums.AppId
    rol: string
    activo?: boolean
    createdAt?: Date | string
  }

  export type AppAccessUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AppAccessUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type AppAccessListRelationFilter = {
    every?: AppAccessWhereInput
    some?: AppAccessWhereInput
    none?: AppAccessWhereInput
  }

  export type AppAccessOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PlatformUserCountOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    nombre?: SortOrder
    password?: SortOrder
    activo?: SortOrder
    isPlatformAdmin?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PlatformUserMaxOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    nombre?: SortOrder
    password?: SortOrder
    activo?: SortOrder
    isPlatformAdmin?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PlatformUserMinOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    nombre?: SortOrder
    password?: SortOrder
    activo?: SortOrder
    isPlatformAdmin?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type EnumAppIdFilter<$PrismaModel = never> = {
    equals?: $Enums.AppId | EnumAppIdFieldRefInput<$PrismaModel>
    in?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    notIn?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    not?: NestedEnumAppIdFilter<$PrismaModel> | $Enums.AppId
  }

  export type PlatformUserScalarRelationFilter = {
    is?: PlatformUserWhereInput
    isNot?: PlatformUserWhereInput
  }

  export type AppAccessUserIdAppCompoundUniqueInput = {
    userId: string
    app: $Enums.AppId
  }

  export type AppAccessCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    app?: SortOrder
    rol?: SortOrder
    activo?: SortOrder
    createdAt?: SortOrder
  }

  export type AppAccessMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    app?: SortOrder
    rol?: SortOrder
    activo?: SortOrder
    createdAt?: SortOrder
  }

  export type AppAccessMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    app?: SortOrder
    rol?: SortOrder
    activo?: SortOrder
    createdAt?: SortOrder
  }

  export type EnumAppIdWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AppId | EnumAppIdFieldRefInput<$PrismaModel>
    in?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    notIn?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    not?: NestedEnumAppIdWithAggregatesFilter<$PrismaModel> | $Enums.AppId
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAppIdFilter<$PrismaModel>
    _max?: NestedEnumAppIdFilter<$PrismaModel>
  }

  export type AppAccessCreateNestedManyWithoutUserInput = {
    create?: XOR<AppAccessCreateWithoutUserInput, AppAccessUncheckedCreateWithoutUserInput> | AppAccessCreateWithoutUserInput[] | AppAccessUncheckedCreateWithoutUserInput[]
    connectOrCreate?: AppAccessCreateOrConnectWithoutUserInput | AppAccessCreateOrConnectWithoutUserInput[]
    createMany?: AppAccessCreateManyUserInputEnvelope
    connect?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
  }

  export type AppAccessUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<AppAccessCreateWithoutUserInput, AppAccessUncheckedCreateWithoutUserInput> | AppAccessCreateWithoutUserInput[] | AppAccessUncheckedCreateWithoutUserInput[]
    connectOrCreate?: AppAccessCreateOrConnectWithoutUserInput | AppAccessCreateOrConnectWithoutUserInput[]
    createMany?: AppAccessCreateManyUserInputEnvelope
    connect?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type AppAccessUpdateManyWithoutUserNestedInput = {
    create?: XOR<AppAccessCreateWithoutUserInput, AppAccessUncheckedCreateWithoutUserInput> | AppAccessCreateWithoutUserInput[] | AppAccessUncheckedCreateWithoutUserInput[]
    connectOrCreate?: AppAccessCreateOrConnectWithoutUserInput | AppAccessCreateOrConnectWithoutUserInput[]
    upsert?: AppAccessUpsertWithWhereUniqueWithoutUserInput | AppAccessUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: AppAccessCreateManyUserInputEnvelope
    set?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    disconnect?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    delete?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    connect?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    update?: AppAccessUpdateWithWhereUniqueWithoutUserInput | AppAccessUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: AppAccessUpdateManyWithWhereWithoutUserInput | AppAccessUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: AppAccessScalarWhereInput | AppAccessScalarWhereInput[]
  }

  export type AppAccessUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<AppAccessCreateWithoutUserInput, AppAccessUncheckedCreateWithoutUserInput> | AppAccessCreateWithoutUserInput[] | AppAccessUncheckedCreateWithoutUserInput[]
    connectOrCreate?: AppAccessCreateOrConnectWithoutUserInput | AppAccessCreateOrConnectWithoutUserInput[]
    upsert?: AppAccessUpsertWithWhereUniqueWithoutUserInput | AppAccessUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: AppAccessCreateManyUserInputEnvelope
    set?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    disconnect?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    delete?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    connect?: AppAccessWhereUniqueInput | AppAccessWhereUniqueInput[]
    update?: AppAccessUpdateWithWhereUniqueWithoutUserInput | AppAccessUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: AppAccessUpdateManyWithWhereWithoutUserInput | AppAccessUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: AppAccessScalarWhereInput | AppAccessScalarWhereInput[]
  }

  export type PlatformUserCreateNestedOneWithoutAppAccessInput = {
    create?: XOR<PlatformUserCreateWithoutAppAccessInput, PlatformUserUncheckedCreateWithoutAppAccessInput>
    connectOrCreate?: PlatformUserCreateOrConnectWithoutAppAccessInput
    connect?: PlatformUserWhereUniqueInput
  }

  export type EnumAppIdFieldUpdateOperationsInput = {
    set?: $Enums.AppId
  }

  export type PlatformUserUpdateOneRequiredWithoutAppAccessNestedInput = {
    create?: XOR<PlatformUserCreateWithoutAppAccessInput, PlatformUserUncheckedCreateWithoutAppAccessInput>
    connectOrCreate?: PlatformUserCreateOrConnectWithoutAppAccessInput
    upsert?: PlatformUserUpsertWithoutAppAccessInput
    connect?: PlatformUserWhereUniqueInput
    update?: XOR<XOR<PlatformUserUpdateToOneWithWhereWithoutAppAccessInput, PlatformUserUpdateWithoutAppAccessInput>, PlatformUserUncheckedUpdateWithoutAppAccessInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedEnumAppIdFilter<$PrismaModel = never> = {
    equals?: $Enums.AppId | EnumAppIdFieldRefInput<$PrismaModel>
    in?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    notIn?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    not?: NestedEnumAppIdFilter<$PrismaModel> | $Enums.AppId
  }

  export type NestedEnumAppIdWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AppId | EnumAppIdFieldRefInput<$PrismaModel>
    in?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    notIn?: $Enums.AppId[] | ListEnumAppIdFieldRefInput<$PrismaModel>
    not?: NestedEnumAppIdWithAggregatesFilter<$PrismaModel> | $Enums.AppId
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAppIdFilter<$PrismaModel>
    _max?: NestedEnumAppIdFilter<$PrismaModel>
  }

  export type AppAccessCreateWithoutUserInput = {
    id?: string
    app: $Enums.AppId
    rol: string
    activo?: boolean
    createdAt?: Date | string
  }

  export type AppAccessUncheckedCreateWithoutUserInput = {
    id?: string
    app: $Enums.AppId
    rol: string
    activo?: boolean
    createdAt?: Date | string
  }

  export type AppAccessCreateOrConnectWithoutUserInput = {
    where: AppAccessWhereUniqueInput
    create: XOR<AppAccessCreateWithoutUserInput, AppAccessUncheckedCreateWithoutUserInput>
  }

  export type AppAccessCreateManyUserInputEnvelope = {
    data: AppAccessCreateManyUserInput | AppAccessCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type AppAccessUpsertWithWhereUniqueWithoutUserInput = {
    where: AppAccessWhereUniqueInput
    update: XOR<AppAccessUpdateWithoutUserInput, AppAccessUncheckedUpdateWithoutUserInput>
    create: XOR<AppAccessCreateWithoutUserInput, AppAccessUncheckedCreateWithoutUserInput>
  }

  export type AppAccessUpdateWithWhereUniqueWithoutUserInput = {
    where: AppAccessWhereUniqueInput
    data: XOR<AppAccessUpdateWithoutUserInput, AppAccessUncheckedUpdateWithoutUserInput>
  }

  export type AppAccessUpdateManyWithWhereWithoutUserInput = {
    where: AppAccessScalarWhereInput
    data: XOR<AppAccessUpdateManyMutationInput, AppAccessUncheckedUpdateManyWithoutUserInput>
  }

  export type AppAccessScalarWhereInput = {
    AND?: AppAccessScalarWhereInput | AppAccessScalarWhereInput[]
    OR?: AppAccessScalarWhereInput[]
    NOT?: AppAccessScalarWhereInput | AppAccessScalarWhereInput[]
    id?: StringFilter<"AppAccess"> | string
    userId?: StringFilter<"AppAccess"> | string
    app?: EnumAppIdFilter<"AppAccess"> | $Enums.AppId
    rol?: StringFilter<"AppAccess"> | string
    activo?: BoolFilter<"AppAccess"> | boolean
    createdAt?: DateTimeFilter<"AppAccess"> | Date | string
  }

  export type PlatformUserCreateWithoutAppAccessInput = {
    id?: string
    email: string
    nombre: string
    password: string
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlatformUserUncheckedCreateWithoutAppAccessInput = {
    id?: string
    email: string
    nombre: string
    password: string
    activo?: boolean
    isPlatformAdmin?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlatformUserCreateOrConnectWithoutAppAccessInput = {
    where: PlatformUserWhereUniqueInput
    create: XOR<PlatformUserCreateWithoutAppAccessInput, PlatformUserUncheckedCreateWithoutAppAccessInput>
  }

  export type PlatformUserUpsertWithoutAppAccessInput = {
    update: XOR<PlatformUserUpdateWithoutAppAccessInput, PlatformUserUncheckedUpdateWithoutAppAccessInput>
    create: XOR<PlatformUserCreateWithoutAppAccessInput, PlatformUserUncheckedCreateWithoutAppAccessInput>
    where?: PlatformUserWhereInput
  }

  export type PlatformUserUpdateToOneWithWhereWithoutAppAccessInput = {
    where?: PlatformUserWhereInput
    data: XOR<PlatformUserUpdateWithoutAppAccessInput, PlatformUserUncheckedUpdateWithoutAppAccessInput>
  }

  export type PlatformUserUpdateWithoutAppAccessInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    nombre?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    isPlatformAdmin?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlatformUserUncheckedUpdateWithoutAppAccessInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    nombre?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    isPlatformAdmin?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AppAccessCreateManyUserInput = {
    id?: string
    app: $Enums.AppId
    rol: string
    activo?: boolean
    createdAt?: Date | string
  }

  export type AppAccessUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AppAccessUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AppAccessUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    app?: EnumAppIdFieldUpdateOperationsInput | $Enums.AppId
    rol?: StringFieldUpdateOperationsInput | string
    activo?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}