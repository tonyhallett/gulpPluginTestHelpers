interface ToString{
    (stream:NodeJS.ReadableStream,cb?:(err?:Error,data?:string)=>void):Promise<string>
    (stream:NodeJS.ReadableStream,encoding:string,cb?:(err?:Error,data?:string)=>void):Promise<string>
}
declare const toExport:ToString
export = toExport;

