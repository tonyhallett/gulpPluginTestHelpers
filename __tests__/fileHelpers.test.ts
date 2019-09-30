import fromString =require( 'from2-string');
import { File } from "th-gulphelpers";
import {createStreamFile, getFileContents, createBufferFile, createStreamOrBufferFile, getFileType, FileType} from '../fileHelpers'
describe('helpers',()=>{
    describe("getFileContents",()=>{
        it("should return file contents for a stream file",()=>{
            const fileContents="File contents"
            var file = new File({
                contents: fromString(fileContents)
            });
            expect(getFileContents(file)).resolves.toEqual(fileContents);
        })
        it('should return file contents for a buffer file',()=>{
            const fileContents="File contents"
            var file = new File({
                contents: Buffer.from(fileContents)
            });
            expect(getFileContents(file)).resolves.toBe(fileContents);
        })
        it('should return null for a null file',()=>{
            const nullFile=new File();
            expect(getFileContents(nullFile)).resolves.toBeNull();
        })
    })
    describe("file creation",()=>{
        describe('createStreamFile',()=>{
            it('should create a vinyl stream file',()=>{
                const streamFile = createStreamFile("")
                expect(streamFile).toBeInstanceOf(File);
                expect(streamFile.isStream()).toBe(true);
            })
            it('should have stream contents',()=>{
                expect(getFileContents(createStreamFile("file contents"))).resolves.toBe("file contents");
            })
            it('should call the callback with the file if present',()=>{
                const cb=jest.fn();
                const streamFile = createStreamFile("",cb);
                expect(cb).toHaveBeenCalledWith(streamFile);
            })
        })
        describe('createBufferFile',()=>{
            it('should create a vinyl buffer file',()=>{
                const bufferFile = createBufferFile("")
                expect(bufferFile).toBeInstanceOf(File);
                expect(bufferFile.isBuffer()).toBe(true);
            })
            it('should have stream contents',()=>{
                expect(getFileContents(createBufferFile("file contents"))).resolves.toBe("file contents");
            })
            it('should call the callback with the file if present',()=>{
                const cb=jest.fn();
                const bufferFile = createBufferFile("",cb);
                expect(cb).toHaveBeenCalledWith(bufferFile);
            })
        })
        describe('createStreamOrBufferFile',()=>{
            [true,false].forEach(isStream=>{
                it(`should create a ${isStream?'stream':'buffer'} file if requests stream, with contents and calling the callback`,()=>{
                    const cb=jest.fn();
                    const streamOrBufferFile=createStreamOrBufferFile("file contents",isStream,cb);
                    expect(cb).toHaveBeenCalledWith(streamOrBufferFile);
                    if(isStream){
                        expect(streamOrBufferFile.isStream()).toBe(true);
                        expect(streamOrBufferFile.isBuffer()).toBe(false);
                    }else{
                        expect(streamOrBufferFile.isStream()).toBe(false);
                        expect(streamOrBufferFile.isBuffer()).toBe(true);
                    }
                    expect(getFileContents(streamOrBufferFile)).resolves.toBe("file contents");
                })
            })
        })
    })
    describe("get file type",()=>{
        it("should return FileType.Stream for Stream",()=>{
            expect(getFileType(createStreamFile(""))).toBe(FileType.Stream);
        })
        it("should return FileType.Buffer for Buffer",()=>{
            expect(getFileType(createBufferFile(""))).toBe(FileType.Buffer);
        })
        it("should return FileType.Null for Null",()=>{
            expect(getFileType(new File())).toBe(FileType.Null);
        })
    })
})