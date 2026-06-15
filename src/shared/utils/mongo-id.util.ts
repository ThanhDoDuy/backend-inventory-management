import { Types } from 'mongoose';

type ObjectIdLike =
  | Types.ObjectId
  | string
  | { _id?: Types.ObjectId | string; id?: Types.ObjectId | string };

export function toObjectIdString(value: ObjectIdLike): string {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value._id) {
    return toObjectIdString(value._id);
  }

  if (value.id) {
    return toObjectIdString(value.id);
  }

  throw new Error('Unable to resolve ObjectId string');
}
