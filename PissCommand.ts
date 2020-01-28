import { AbstractCommandModule, Message, OutgoingMessage } from "botyo-api";
import fs = require('fs');
import path = require('path');

export default class PissCommand extends AbstractCommandModule {
   get basedir(): string {
      return process.cwd();
   }

   get attachmentsDir(): string {
      return path.join(this.basedir, "attachments");
   }

   getCommand(): string {
      return "piss";
   }

   getDescription(): string {
      return "Responds to the hello";
   }

   getUsage(): string {
      return "";
   }

   validate(msg: Message, args: string): boolean {
      if (!args) {
         return false;
      }

      const parsedArgs = this.parseArgs(args);
      if (parsedArgs == null || parsedArgs.dir == null) {
         return false;
      }

      var dirPath: string = path.join(this.attachmentsDir, parsedArgs.dir);
      if (fs.existsSync(dirPath)) {
         var files: string[] = fs.readdirSync(dirPath);
         if (files.length > 0) {
            if (parsedArgs.number != null && !fs.existsSync(path.join(dirPath, parsedArgs.number))) {
               return false;
            }
            return true;
         }
      }
      return false;
   }

   async execute(msg: Message, args: string): Promise<any> {
      const parsedArgs = this.parseArgs(args);
      if (parsedArgs == null) {
         return null;
      }

      var attachmentPath: string = path.join(this.attachmentsDir, parsedArgs.dir);
      if (parsedArgs.number != null) {
         attachmentPath = path.join(attachmentPath, parsedArgs.number);
      }

      var message: OutgoingMessage = {
         attachment: fs.createReadStream(attachmentPath)
      }

      return this.getRuntime().getChatApi().sendMessage(msg.threadID, message);
   }

   private parseArgs(args: string) {
      if (args == null) return null;

      const splitted = args.split(/(\d+)/).filter(Boolean);

      const dir = splitted[0];
      const number = splitted[1];

      return {
         dir: dir,
         number: number
      };
   }
}