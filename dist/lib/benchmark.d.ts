export declare function benchmark<A>(subject: (() => A) | (() => Promise<A>), times?: number): Promise<A>;
